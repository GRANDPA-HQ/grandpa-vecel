import "server-only"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// 시니어 직급 기준 레벨 (ranks.level >= 30 → 관리 권한)
export const SENIOR_LEVEL = 30

export type CurrentEmployee = {
  id: string
  name: string
  email: string
  // 관리 권한 (직원 관리, 생산 공정 승인/반려 등) — 직급이 시니어 이상
  isSenior: boolean
  // 소속 매장 (tb_store_mst) — 과거 계정(employees 미등록)은 null
  storeId: string | null
  storeName: string | null
}

/**
 * 로그인한 사용자의 직원 정보와 관리 권한 여부를 조회한다.
 * 권한 기준: employees.rank(직급)의 level이 시니어(30) 이상.
 * employees에 아직 없는 과거 계정은 users의 직책이 점장이면 시니어로 취급한다.
 */
export async function getCurrentEmployee(): Promise<CurrentEmployee | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from("employees")
    .select("name, email, store_id, ranks(name_ko, level), tb_store_mst(store_name)")
    .eq("id", user.id)
    .maybeSingle()

  let name = (data?.name as string | undefined) ?? ""
  let isSenior = false
  let storeId: string | null = null
  let storeName: string | null = null

  if (data) {
    const rank = data.ranks as unknown as { name_ko: string; level: number } | null
    isSenior = (rank?.level ?? 0) >= SENIOR_LEVEL
    storeId = (data.store_id as string | null | undefined) ?? null
    storeName =
      (data.tb_store_mst as unknown as { store_name: string } | null)?.store_name ?? null
  } else {
    // 아직 employees로 이전되지 않은 계정 호환 (users + 점장 직책)
    const { data: legacy } = await admin
      .from("users")
      .select("name, positions(name_ko)")
      .eq("id", user.id)
      .maybeSingle()
    name = (legacy?.name as string | undefined) ?? ""
    isSenior =
      ((legacy?.positions as unknown as { name_ko: string } | null)?.name_ko ?? "") === "점장"
  }

  return {
    id: user.id,
    name: name || user.email?.split("@")[0] || "사용자",
    email: user.email ?? "",
    isSenior,
    storeId,
    storeName,
  }
}
