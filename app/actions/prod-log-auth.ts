"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { verifyPin } from "@/lib/pin"
import { setProdLogActor, clearProdLogActor } from "@/lib/prod-log-session"

// 생산 기록 PIN 인증 — 원재료 재고관리 세션에서 만든 재사용 가능한 게이트를 그대로 쓴다.
// 근무중 직원 조회는 app/actions/raw-stock-auth.ts의 getWorkingStaffForRawStock()을 호출부에서
// 직접 import해 재사용한다(파트 제한 없이 매장 전 직원을 이미 반환하도록 만들어져 있어 이름과
// 달리 범용 — "use server" 파일의 re-export는 Next 서버 액션 컴파일러가 지원하지 않아 여기서
// 다시 export하지 않는다).

type Result = { error?: string; success?: boolean; staffName?: string }

export async function verifyProdLogPin(staffId: string, pin: string): Promise<Result> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!/^\d{4}$/.test(pin)) return { error: "PIN은 4자리 숫자입니다." }

  const admin = createAdminClient()
  const [{ data: staffRow }, { data: authRow }] = await Promise.all([
    admin.from("staff").select("id, name, store_id").eq("id", staffId).maybeSingle(),
    admin.from("tb_sp_staff_auth").select("pin_hash").eq("staff_id", staffId).maybeSingle(),
  ])
  if (!staffRow || staffRow.store_id !== employee.storeId || !authRow) {
    return { error: "직원 정보를 찾을 수 없습니다." }
  }

  const pinOk = await verifyPin(pin, authRow.pin_hash as string)
  if (!pinOk) return { error: "PIN이 일치하지 않습니다." }

  await setProdLogActor(staffId)
  revalidatePath("/dashboard/production-record")
  return { success: true, staffName: staffRow.name as string }
}

export async function exitProdLogSession(): Promise<void> {
  await clearProdLogActor()
  revalidatePath("/dashboard/production-record")
}
