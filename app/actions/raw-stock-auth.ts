"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { verifyPin } from "@/lib/pin"
import { deriveStatus, type AttendanceLogRow, type CheckType } from "@/lib/attendance-status"
import { todayKst, addDaysKst, kstDateToIso } from "@/lib/date-kst"
import {
  setRawStockActor,
  clearRawStockActor,
  setRawStockAuditActor,
  clearRawStockAuditActor,
} from "@/lib/raw-stock-session"

// 원재료 재고관리 공용 PIN 인증 — "직원선택→PIN" 화면(재고관리_공통인증_직원선택PIN_v0.3.html)의
// 서버 로직. 출퇴근 키오스크(app/actions/attendance.ts)와 동일한 인프라(tb_sp_staff_auth.pin_hash,
// tb_sp_attendance_log 기반 근무중 판정)를 재사용한다 — 새 PIN 저장소를 만들지 않는다.

export type WorkingStaffOption = { id: string; name: string; partCode: string | null }

function todayRangeIso() {
  const day = todayKst()
  return { from: kstDateToIso(day), to: kstDateToIso(addDaysKst(day, 1)) }
}

/** 오늘 근무중(출근함·아직 퇴근 전 — WORKING 또는 ON_BREAK)인 직원 목록. 파트 무관 전체(대리 입고 등 과도기 허용). */
export async function getWorkingStaffForRawStock(): Promise<{ staff: WorkingStaffOption[] } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없어 재고관리를 사용할 수 없습니다." }

  const admin = createAdminClient()
  const { from, to } = todayRangeIso()

  const [{ data: staffRows, error: staffError }, { data: logRows, error: logError }] = await Promise.all([
    admin.from("staff").select("id, name, parts(code)").eq("store_id", employee.storeId).order("name", { ascending: true }),
    admin
      .from("tb_sp_attendance_log")
      .select("staff_id, check_type, checked_at")
      .eq("store_id", employee.storeId)
      .gte("checked_at", from)
      .lt("checked_at", to),
  ])
  if (staffError) return { error: staffError.message }
  if (logError) return { error: logError.message }

  const logsByStaff = new Map<string, AttendanceLogRow[]>()
  for (const row of logRows ?? []) {
    const list = logsByStaff.get(row.staff_id as string) ?? []
    list.push({ check_type: row.check_type as CheckType, checked_at: row.checked_at as string })
    logsByStaff.set(row.staff_id as string, list)
  }

  const staff = (staffRows ?? [])
    .map((row) => {
      const { status } = deriveStatus(logsByStaff.get(row.id as string) ?? [])
      const part = row.parts as unknown as { code: string } | null
      return { id: row.id as string, name: row.name as string, partCode: part?.code ?? null, status }
    })
    .filter((s) => s.status === "WORKING" || s.status === "ON_BREAK")
    .map(({ id, name, partCode }) => ({ id, name, partCode }))

  return { staff }
}

type Result = { error?: string; success?: boolean; staffName?: string }

/** PIN 4자리 대조 성공 시 해당 세션 쿠키를 설정한다. audit=true면 실사 전용 쿠키(별도 PIN, 설계서 명시). */
async function verifyRawStockPin(staffId: string, pin: string, audit: boolean): Promise<Result> {
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

  if (audit) await setRawStockAuditActor(staffId)
  else await setRawStockActor(staffId)

  revalidatePath("/dashboard/raw-stock")
  return { success: true, staffName: staffRow.name as string }
}

// 클라이언트 컴포넌트(RawStockAuthGate)에 그대로 prop으로 넘길 서버 액션 참조 — Next.js는 클라이언트에
// 넘기는 함수가 "use server" 파일에서 export된 실제 액션이어야 하므로, audit 플래그를 인자로 받는 대신
// 용도별로 두 개를 export한다.
export async function verifyRawStockPinStandard(staffId: string, pin: string): Promise<Result> {
  return verifyRawStockPin(staffId, pin, false)
}
export async function verifyRawStockPinAudit(staffId: string, pin: string): Promise<Result> {
  return verifyRawStockPin(staffId, pin, true)
}

/** "나가기" — 원재료 재고 세션 종료. */
export async function exitRawStockSession(): Promise<void> {
  await clearRawStockActor()
  revalidatePath("/dashboard/raw-stock")
}

export async function exitRawStockAuditSession(): Promise<void> {
  await clearRawStockAuditActor()
  revalidatePath("/dashboard/raw-stock/audit")
}
