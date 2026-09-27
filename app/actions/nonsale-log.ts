"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getCurrentEmployee } from "@/lib/permissions"
import { getNonsaleActor, setNonsaleActor } from "@/lib/nonsale-session"
import { todayKst, addDaysKst, kstDateToIso } from "@/lib/date-kst"
import { NONSALE_REASON_OPTIONS, nonsaleMemoRequired, type NonsaleReasonCode } from "@/lib/nonsale"

type Result = { error?: string; success?: boolean; savedCount?: number }
type Actor = { staffId: string; storeId: string }

async function requireNonsaleActor(): Promise<Actor | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없어 판매 외 소진을 사용할 수 없습니다." }
  const staffId = await getNonsaleActor()
  if (!staffId) return { error: "세션이 만료되었습니다. 다시 본인 확인을 해주세요." }
  await setNonsaleActor(staffId) // 슬라이딩 만료(10분 무입력 자동 종료)
  return { staffId, storeId: employee.storeId }
}

function todayRangeIso() {
  const day = todayKst()
  return { from: kstDateToIso(day), to: kstDateToIso(addDaysKst(day, 1)) }
}

export type NonsaleLogEntry = {
  skuId: string
  qty: number
  reasonCode: NonsaleReasonCode
  memo?: string
}

/**
 * 담은 판매품 레시피(tb_sku_recipe)를 조회해 생산품별 tb_prod_stock_txn CONSUME 행을 만든다.
 * 레시피가 없거나 단위가 tb_prod_mst.unit과 다르면 해당 생산품 차감만 조용히 스킵한다
 * (설계서 N-7 — 로그는 항상 저장, 소급 차감 없음. 스킵 표시는 매니저 관리 화면 소관, 별도 세션).
 */
async function consumeForNonsaleLog(
  admin: SupabaseClient,
  storeId: string,
  staffId: string,
  skuId: string,
  qty: number,
  logId: string,
): Promise<string | null> {
  const { data: recipeRows, error: recipeError } = await admin
    .from("tb_sku_recipe")
    .select("prod_id, amount, unit")
    .eq("sku_id", skuId)
  if (recipeError) return recipeError.message
  if (!recipeRows || recipeRows.length === 0) return null

  const prodIds = [...new Set(recipeRows.map((r) => r.prod_id as string))]
  const { data: prodRows, error: prodError } = await admin.from("tb_prod_mst").select("id, prod_code, unit").in("id", prodIds)
  if (prodError) return prodError.message
  const prodById = new Map((prodRows ?? []).map((p) => [p.id as string, p as { id: string; prod_code: string; unit: string }]))

  for (const r of recipeRows as { prod_id: string; amount: number | null; unit: string | null }[]) {
    const prod = prodById.get(r.prod_id)
    if (!prod || !r.amount || r.unit !== prod.unit) continue // 레시피 미등록 상당(매칭 실패)·단위 불일치 → 차감 스킵

    const { error: txnError } = await admin.from("tb_prod_stock_txn").insert({
      store_id: storeId,
      prod_code: prod.prod_code,
      txn_type: "CONSUME",
      qty: -(r.amount * qty),
      ref_type: "SKU_NONSALE",
      ref_id: logId,
      created_by: staffId,
    })
    if (txnError) return txnError.message
  }
  return null
}

/**
 * 장바구니 전체 저장 — 담은 줄마다 tb_sku_nonsale_log 1행 + 레시피 생산품별 CONSUME N행을
 * 순차 insert한다(생산 기록과 동일한 단순함 수준 — DB 트랜잭션으로 묶지 않는다).
 */
export async function saveNonsaleLog(entries: NonsaleLogEntry[]): Promise<Result> {
  const auth = await requireNonsaleActor()
  if ("error" in auth) return { error: auth.error }
  if (entries.length === 0) return { error: "담긴 메뉴가 없습니다." }
  const validCodes = new Set(NONSALE_REASON_OPTIONS.map((r) => r.code))
  for (const e of entries) {
    if (!(e.qty > 0)) return { error: "개수는 1개 이상이어야 합니다." }
    if (!validCodes.has(e.reasonCode)) return { error: "사유를 선택해주세요." }
    if (nonsaleMemoRequired(e.reasonCode) && !e.memo?.trim()) return { error: "기타 사유는 메모를 적어주세요." }
  }

  const admin = createAdminClient()
  let savedCount = 0

  for (const entry of entries) {
    const { data: logRow, error: logError } = await admin
      .from("tb_sku_nonsale_log")
      .insert({
        store_id: auth.storeId,
        sku_id: entry.skuId,
        qty: entry.qty,
        reason_code: entry.reasonCode,
        reason_memo: entry.memo?.trim() || null,
        created_by: auth.staffId,
      })
      .select("log_id")
      .single()
    if (logError) return { error: `기록 저장에 실패했습니다. ${logError.message}`, savedCount }

    const consumeError = await consumeForNonsaleLog(admin, auth.storeId, auth.staffId, entry.skuId, entry.qty, logRow.log_id)
    if (consumeError) return { error: `재고 반영에 실패했습니다. ${consumeError}`, savedCount }

    savedCount++
  }

  revalidatePath("/dashboard/sku-nonsale")
  return { success: true, savedCount }
}

/**
 * 취소 — 원 기록(cancel_of IS NULL) · 미취소 · 본인 입력분 · 당일(KST)만 가능. 취소 행 추가 +
 * 원 CONSUME 행을 레시피 재계산 없이 부호만 반전해 되돌린다(원 차감을 정확히 상쇄).
 */
export async function cancelNonsaleLog(logId: string): Promise<Result> {
  const auth = await requireNonsaleActor()
  if ("error" in auth) return { error: auth.error }

  const admin = createAdminClient()
  const { data: orig, error: origError } = await admin
    .from("tb_sku_nonsale_log")
    .select("log_id, store_id, sku_id, qty, reason_code, reason_memo, cancel_of, created_by, created_at")
    .eq("log_id", logId)
    .maybeSingle()
  if (origError) return { error: origError.message }
  if (!orig) return { error: "기록을 찾을 수 없습니다." }
  if (orig.cancel_of) return { error: "취소 기록은 다시 취소할 수 없습니다." }
  if (orig.created_by !== auth.staffId) return { error: "본인이 입력한 기록만 취소할 수 있습니다." }

  const { from, to } = todayRangeIso()
  if (orig.created_at < from || orig.created_at >= to) {
    return { error: "오늘 남긴 기록만 취소할 수 있습니다." }
  }

  const { data: existingCancel } = await admin.from("tb_sku_nonsale_log").select("log_id").eq("cancel_of", logId).maybeSingle()
  if (existingCancel) return { error: "이미 취소된 기록입니다." }

  const { data: cancelRow, error: cancelError } = await admin
    .from("tb_sku_nonsale_log")
    .insert({
      store_id: orig.store_id,
      sku_id: orig.sku_id,
      qty: orig.qty,
      reason_code: orig.reason_code,
      reason_memo: orig.reason_memo,
      cancel_of: orig.log_id,
      created_by: auth.staffId,
    })
    .select("log_id")
    .single()
  if (cancelError) return { error: `취소 저장에 실패했습니다. ${cancelError.message}` }

  const { data: origTxns, error: txnFetchError } = await admin
    .from("tb_prod_stock_txn")
    .select("prod_code, qty")
    .eq("ref_type", "SKU_NONSALE")
    .eq("ref_id", logId)
  if (txnFetchError) return { error: `역분개 조회에 실패했습니다. ${txnFetchError.message}` }

  for (const t of origTxns ?? []) {
    const { error: reverseError } = await admin.from("tb_prod_stock_txn").insert({
      store_id: orig.store_id,
      prod_code: t.prod_code,
      txn_type: "CONSUME",
      qty: -(t.qty as number),
      ref_type: "SKU_NONSALE",
      ref_id: cancelRow.log_id,
      created_by: auth.staffId,
    })
    if (reverseError) return { error: `역분개 저장에 실패했습니다. ${reverseError.message}` }
  }

  revalidatePath("/dashboard/sku-nonsale")
  return { success: true }
}
