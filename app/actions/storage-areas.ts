"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"

type Result = { error?: string; success?: boolean; mappedCount?: number }

// 보관영역 등록/이름변경/삭제/순서/활성토글 = 매니저 이상 (설계서 제약·규칙 #5)
async function requireManager(): Promise<{ error: string } | null> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "매니저 이상만 보관영역을 관리할 수 있습니다." }
  return null
}

function revalidateStoreArea(storeId: string) {
  revalidatePath(`/dashboard/storage-areas/${storeId}`)
  revalidatePath("/dashboard/data-table/tb_store_mst")
}

export async function createStorageArea(storeId: string, areaName: string): Promise<Result> {
  const authError = await requireManager()
  if (authError) return authError

  const name = areaName.trim()
  if (!name) return { error: "영역 이름을 입력해주세요." }

  const admin = createAdminClient()
  const { data: maxRow } = await admin
    .from("tb_storage_area_mst")
    .select("sort_order")
    .eq("store_id", storeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((maxRow?.sort_order as number | undefined) ?? -1) + 1

  const { error } = await admin.from("tb_storage_area_mst").insert({
    store_id: storeId,
    area_name: name,
    sort_order: nextOrder,
  })
  if (error) return { error: `추가에 실패했습니다. ${error.message}` }

  revalidateStoreArea(storeId)
  return { success: true }
}

export async function renameStorageArea(areaId: string, storeId: string, areaName: string): Promise<Result> {
  const authError = await requireManager()
  if (authError) return authError

  const name = areaName.trim()
  if (!name) return { error: "영역 이름을 입력해주세요." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("tb_storage_area_mst")
    .update({ area_name: name, updated_at: new Date().toISOString() })
    .eq("id", areaId)
  if (error) return { error: `수정에 실패했습니다. ${error.message}` }

  revalidateStoreArea(storeId)
  return { success: true }
}

// 매핑이 있는 영역은 물리 삭제보다 비활성화를 권장(설계서 #9) — 실제 차단은 클라이언트 확인
// 모달에서 안내하고, 여기서는 요청대로 삭제를 수행한다(FK ON DELETE CASCADE로 매핑도 함께 삭제됨).
export async function deleteStorageArea(areaId: string, storeId: string): Promise<Result> {
  const authError = await requireManager()
  if (authError) return authError

  const admin = createAdminClient()
  const { error } = await admin.from("tb_storage_area_mst").delete().eq("id", areaId)
  if (error) return { error: `삭제에 실패했습니다. ${error.message}` }

  revalidateStoreArea(storeId)
  return { success: true }
}

// 비활성 전환은 매핑 0건일 때만 허용(설계서 제약·규칙 #6) — 서버에서도 재확인해 경합을 방지한다.
export async function setStorageAreaActive(
  areaId: string,
  storeId: string,
  isActive: boolean,
): Promise<Result> {
  const authError = await requireManager()
  if (authError) return authError

  const admin = createAdminClient()

  if (!isActive) {
    const { count, error: countError } = await admin
      .from("tb_submat_storage_area_link")
      .select("id", { count: "exact", head: true })
      .eq("area_id", areaId)
    if (countError) return { error: `확인에 실패했습니다. ${countError.message}` }
    if ((count ?? 0) > 0) {
      return {
        error: "아직 매핑된 부자재가 있어 비활성으로 바꿀 수 없습니다.",
        mappedCount: count ?? 0,
      }
    }
  }

  const { error } = await admin
    .from("tb_storage_area_mst")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", areaId)
  if (error) return { error: `변경에 실패했습니다. ${error.message}` }

  revalidateStoreArea(storeId)
  return { success: true }
}

export async function reorderStorageAreas(storeId: string, orderedIds: string[]): Promise<Result> {
  const authError = await requireManager()
  if (authError) return authError

  const admin = createAdminClient()
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      admin.from("tb_storage_area_mst").update({ sort_order: index }).eq("id", id),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) return { error: `순서 저장에 실패했습니다. ${failed.error.message}` }

  revalidateStoreArea(storeId)
  return { success: true }
}
