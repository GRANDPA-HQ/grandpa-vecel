"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"

type Result = { error?: string; success?: boolean }

async function requireStaff(): Promise<{ id: string; storeId: string } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없어 재고를 관리할 수 없습니다." }
  return { id: employee.id, storeId: employee.storeId }
}

function revalidateStock(submatId?: string) {
  revalidatePath("/dashboard/stock")
  revalidatePath("/dashboard/stock/count")
  revalidatePath("/dashboard/stock/mapping")
  if (submatId) revalidatePath(`/dashboard/stock/${encodeURIComponent(submatId)}`)
}

/**
 * 입고(IN) 트랜잭션 생성. qty = input_box × packs_per_box + input_pack (팩 환산은 항상 서버에서
 * 마스터 packs_per_box를 다시 조회해 계산한다 — 클라이언트 계산값을 신뢰하지 않는다).
 */
export async function receiveSubmatStock(
  submatId: string,
  inputBox: number | null,
  inputPack: number,
): Promise<Result> {
  const auth = await requireStaff()
  if ("error" in auth) return { error: auth.error }

  if (inputPack < 0 || (inputBox !== null && inputBox < 0)) {
    return { error: "0 이상의 값을 입력해주세요." }
  }
  if ((inputBox ?? 0) === 0 && inputPack === 0) {
    return { error: "받은 수량을 입력해주세요." }
  }

  const admin = createAdminClient()
  const { data: master } = await admin
    .from("tb_submat_mst")
    .select("packs_per_box")
    .eq("submat_id", submatId)
    .maybeSingle()
  const packsPerBox = (master?.packs_per_box as number | null) ?? 1
  const qty = (inputBox ?? 0) * packsPerBox + inputPack

  const { error } = await admin.from("tb_submat_stock_txn").insert({
    store_id: auth.storeId,
    submat_id: submatId,
    txn_type: "IN",
    qty,
    input_box: inputBox,
    input_pack: inputPack,
    created_by: auth.id,
  })
  if (error) return { error: `입고 저장에 실패했습니다. ${error.message}` }

  revalidateStock(submatId)
  return { success: true }
}

/**
 * 정기실사 확정 — 각 영역에서 입력한 값을 합산한 총재고와 시스템 재고(SUM(qty))의 차이만큼
 * ADJ(reason_type=정기실사) 트랜잭션 1건을 남긴다. 차이가 0이면 트랜잭션을 남기지 않는다.
 */
export async function submitCycleCount(submatId: string, countedTotal: number): Promise<Result> {
  const auth = await requireStaff()
  if ("error" in auth) return { error: auth.error }
  if (countedTotal < 0) return { error: "0 이상의 값을 입력해주세요." }

  const admin = createAdminClient()
  const { data: txns } = await admin
    .from("tb_submat_stock_txn")
    .select("qty")
    .eq("store_id", auth.storeId)
    .eq("submat_id", submatId)
  const currentStock = (txns ?? []).reduce((sum, t) => sum + (t.qty as number), 0)
  const diff = countedTotal - currentStock
  if (diff === 0) {
    revalidateStock(submatId)
    return { success: true }
  }

  const { error } = await admin.from("tb_submat_stock_txn").insert({
    store_id: auth.storeId,
    submat_id: submatId,
    txn_type: "ADJ",
    qty: diff,
    reason_type: "정기실사",
    created_by: auth.id,
  })
  if (error) return { error: `실사 저장에 실패했습니다. ${error.message}` }

  revalidateStock(submatId)
  return { success: true }
}

/** 부자재 ↔ 보관영역 매핑을 지정한 areaIds 집합으로 교체(추가분 insert, 제외분 delete). */
export async function setSubmatAreaMappings(submatId: string, areaIds: string[]): Promise<Result> {
  const auth = await requireStaff()
  if ("error" in auth) return { error: auth.error }

  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from("tb_submat_storage_area_link")
    .select("area_id")
    .eq("submat_id", submatId)
  if (readError) return { error: `조회에 실패했습니다. ${readError.message}` }

  const existingIds = new Set((existing ?? []).map((r) => r.area_id as string))
  const nextIds = new Set(areaIds)
  const toAdd = areaIds.filter((id) => !existingIds.has(id))
  const toRemove = Array.from(existingIds).filter((id) => !nextIds.has(id))

  if (toRemove.length > 0) {
    const { error } = await admin
      .from("tb_submat_storage_area_link")
      .delete()
      .eq("submat_id", submatId)
      .in("area_id", toRemove)
    if (error) return { error: `매핑 해제에 실패했습니다. ${error.message}` }
  }
  if (toAdd.length > 0) {
    const { error } = await admin
      .from("tb_submat_storage_area_link")
      .insert(toAdd.map((areaId) => ({ submat_id: submatId, area_id: areaId })))
    if (error) return { error: `매핑 저장에 실패했습니다. ${error.message}` }
  }

  revalidateStock(submatId)
  return { success: true }
}
