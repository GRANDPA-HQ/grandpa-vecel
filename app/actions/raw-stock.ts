"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { getRawStockActor, getRawStockAuditActor, setRawStockActor, setRawStockAuditActor } from "@/lib/raw-stock-session"
import { reasonMemoRequired, type ReturnReasonCode, type WasteReasonCode } from "@/lib/raw-stock"

type Result = { error?: string; success?: boolean }
type Actor = { staffId: string; storeId: string }

async function requireStockActor(): Promise<Actor | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없어 재고를 관리할 수 없습니다." }
  const staffId = await getRawStockActor()
  if (!staffId) return { error: "세션이 만료되었습니다. 다시 본인 확인을 해주세요." }
  // 슬라이딩 만료 — 액션 성공 시마다 10분 재연장(설계서 "10분 무입력 시 자동 종료")
  await setRawStockActor(staffId)
  return { staffId, storeId: employee.storeId }
}

async function requireAuditActor(): Promise<Actor | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없어 재고를 관리할 수 없습니다." }
  const staffId = await getRawStockAuditActor()
  if (!staffId) return { error: "실사 세션이 만료되었습니다. 다시 본인 확인을 해주세요." }
  await setRawStockAuditActor(staffId)
  return { staffId, storeId: employee.storeId }
}

function revalidateRawStock(rawCode?: string) {
  revalidatePath("/dashboard/raw-stock")
  revalidatePath("/dashboard/raw-stock/audit")
  if (rawCode) revalidatePath(`/dashboard/raw-stock/${encodeURIComponent(rawCode)}`)
}

async function getCountSize(admin: ReturnType<typeof createAdminClient>, rawCode: string): Promise<number | null> {
  const { data } = await admin.from("tb_raw_mst").select("count_size").eq("raw_code", rawCode).maybeSingle()
  return (data?.count_size as number | null) ?? null
}

/**
 * 입고(IN) — 개수 입력만 받는다(업무가이드 A). count_size가 없는 품목(규격 미입력)은 입고를 받을 수
 * 없으므로 에러로 안내한다(서대표 내부 작업으로 규격 입력 선행 필요 — 별도 세션 TODO 세션F).
 * 검수 중 불량이 있으면 같은 호출에서 RETURN_HOLD 트랜잭션도 함께 남긴다.
 */
export async function receiveRawStock(
  rawCode: string,
  inputCount: number,
  returnHold?: { count: number; reasonCode: ReturnReasonCode; reasonMemo?: string },
): Promise<Result> {
  const auth = await requireStockActor()
  if ("error" in auth) return { error: auth.error }
  if (inputCount < 0 || (returnHold && returnHold.count < 0)) return { error: "0 이상의 값을 입력해주세요." }
  if (inputCount === 0 && (!returnHold || returnHold.count === 0)) return { error: "받은 수량을 입력해주세요." }
  if (returnHold && reasonMemoRequired(returnHold.reasonCode) && !returnHold.reasonMemo?.trim()) {
    return { error: "기타 사유는 메모를 입력해주세요." }
  }

  const admin = createAdminClient()
  const countSize = await getCountSize(admin, rawCode)
  if (!countSize) return { error: "이 품목은 아직 규격(개당 g)이 설정되지 않아 입고를 처리할 수 없습니다." }

  const rows: Record<string, unknown>[] = []
  if (inputCount > 0) {
    rows.push({
      store_id: auth.storeId,
      raw_code: rawCode,
      txn_type: "IN",
      qty: inputCount * countSize,
      input_count: inputCount,
      created_by: auth.staffId,
    })
  }
  if (returnHold && returnHold.count > 0) {
    rows.push({
      store_id: auth.storeId,
      raw_code: rawCode,
      txn_type: "RETURN_HOLD",
      qty: returnHold.count * countSize,
      input_count: returnHold.count,
      reason_code: returnHold.reasonCode,
      reason_memo: returnHold.reasonMemo?.trim() || null,
      created_by: auth.staffId,
    })
  }
  if (rows.length === 0) return { error: "받은 수량을 입력해주세요." }

  const { error } = await admin.from("tb_raw_stock_txn").insert(rows)
  if (error) return { error: `입고 저장에 실패했습니다. ${error.message}` }

  revalidateRawStock(rawCode)
  return { success: true }
}

/**
 * 폐기(WASTE) — 미개봉 통째(개수) 또는 개봉·부분(g 계량) 중 하나로 입력받는다(업무가이드 B).
 */
export async function wasteRawStock(
  rawCode: string,
  input: { mode: "count" | "weight"; value: number; reasonCode: WasteReasonCode; reasonMemo?: string },
): Promise<Result> {
  const auth = await requireStockActor()
  if ("error" in auth) return { error: auth.error }
  if (input.value <= 0) return { error: "0보다 큰 값을 입력해주세요." }
  if (reasonMemoRequired(input.reasonCode) && !input.reasonMemo?.trim()) {
    return { error: "기타 사유는 메모를 입력해주세요." }
  }

  const admin = createAdminClient()
  let qtyG: number
  let inputCount: number | null = null
  let inputG: number | null = null

  if (input.mode === "count") {
    const countSize = await getCountSize(admin, rawCode)
    if (!countSize) return { error: "이 품목은 아직 규격(개당 g)이 설정되지 않아 개수로 폐기할 수 없습니다. 무게로 입력해주세요." }
    qtyG = input.value * countSize
    inputCount = input.value
  } else {
    qtyG = input.value
    inputG = input.value
  }

  const { error } = await admin.from("tb_raw_stock_txn").insert({
    store_id: auth.storeId,
    raw_code: rawCode,
    txn_type: "WASTE",
    qty: -qtyG,
    input_count: inputCount,
    input_g: inputG,
    reason_code: input.reasonCode,
    reason_memo: input.reasonMemo?.trim() || null,
    created_by: auth.staffId,
  })
  if (error) return { error: `폐기 저장에 실패했습니다. ${error.message}` }

  revalidateRawStock(rawCode)
  return { success: true }
}

export type AuditWasteEntry = {
  mode: "count" | "weight"
  value: number
  reasonCode: WasteReasonCode
  reasonMemo?: string
}

/**
 * 재고 실사 확정 — 상한 게 있으면 폐기(WASTE)부터 기록하고, 그 다음 미개봉 개수(countedUnits)를
 * 계산재고(폐기 반영 후)와 비교해 남은 차이만 조정(ADJ)으로 남긴다(운영규칙 §4 "실사 중 부패는
 * WASTE 먼저 → ADJ는 잔여만", 이중계상 방지). 한 번의 저장은 audit_batch_id로 묶는다.
 */
export async function submitRawAudit(
  rawCode: string,
  countedUnits: number,
  wasteEntries: AuditWasteEntry[] = [],
): Promise<Result> {
  const auth = await requireAuditActor()
  if ("error" in auth) return { error: auth.error }
  if (countedUnits < 0) return { error: "0 이상의 값을 입력해주세요." }
  for (const w of wasteEntries) {
    if (w.value <= 0) return { error: "폐기 수량은 0보다 커야 합니다." }
    if (reasonMemoRequired(w.reasonCode) && !w.reasonMemo?.trim()) return { error: "기타 사유는 메모를 입력해주세요." }
  }

  const admin = createAdminClient()
  const countSize = await getCountSize(admin, rawCode)
  if (!countSize) return { error: "이 품목은 아직 규격(개당 g)이 설정되지 않아 실사를 처리할 수 없습니다." }

  const { data: txns, error: readError } = await admin
    .from("tb_raw_stock_txn")
    .select("qty, txn_type")
    .eq("store_id", auth.storeId)
    .eq("raw_code", rawCode)
    .in("txn_type", ["IN", "CONSUME", "ADJ", "WASTE"])
  if (readError) return { error: `현재고 조회에 실패했습니다. ${readError.message}` }

  const currentStock = (txns ?? []).reduce((sum, t) => sum + (t.qty as number), 0)
  const wasteTotalG = wasteEntries.reduce((sum, w) => sum + (w.mode === "count" ? w.value * countSize : w.value), 0)
  const adjQty = countedUnits * countSize - (currentStock - wasteTotalG)

  if (wasteEntries.length === 0 && adjQty === 0) {
    return { success: true }
  }

  const auditBatchId = randomUUID()
  const rows: Record<string, unknown>[] = wasteEntries.map((w) => ({
    store_id: auth.storeId,
    raw_code: rawCode,
    txn_type: "WASTE",
    qty: -(w.mode === "count" ? w.value * countSize : w.value),
    input_count: w.mode === "count" ? w.value : null,
    input_g: w.mode === "weight" ? w.value : null,
    reason_code: w.reasonCode,
    reason_memo: w.reasonMemo?.trim() || null,
    audit_batch_id: auditBatchId,
    created_by: auth.staffId,
  }))
  if (adjQty !== 0) {
    rows.push({
      store_id: auth.storeId,
      raw_code: rawCode,
      txn_type: "ADJ",
      qty: adjQty,
      input_count: countedUnits,
      reason_code: "AUDIT",
      audit_batch_id: auditBatchId,
      created_by: auth.staffId,
    })
  }

  const { error } = await admin.from("tb_raw_stock_txn").insert(rows)
  if (error) return { error: `실사 저장에 실패했습니다. ${error.message}` }

  revalidateRawStock(rawCode)
  return { success: true }
}
