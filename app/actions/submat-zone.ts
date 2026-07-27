"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * 포장 부자재(submat_id)에 Zone유형(zone_type_id)을 하나 연결한다.
 * TB_SUBMAT_ZONE_LINK: (submat_id, zone_type_id) 다대다 연결 테이블.
 */
export async function addSubmatZoneLink(
  submatId: string,
  zoneTypeId: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("tb_submat_zone_link")
    .insert({ submat_id: submatId, zone_type_id: zoneTypeId })

  if (error) {
    // 이미 연결된 경우(UNIQUE 위반)는 에러로 취급하지 않는다
    if (error.code === "23505") return { success: true }
    return { error: error.message }
  }

  revalidatePath("/dashboard/data-table/tb_submat_mst")
  return { success: true }
}

/**
 * 포장 부자재-Zone유형 연결을 하나 해제한다.
 */
export async function removeSubmatZoneLink(
  submatId: string,
  zoneTypeId: string,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("tb_submat_zone_link")
    .delete()
    .eq("submat_id", submatId)
    .eq("zone_type_id", zoneTypeId)

  if (error) return { error: error.message }

  revalidatePath("/dashboard/data-table/tb_submat_mst")
  return { success: true }
}
