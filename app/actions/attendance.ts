"use server"

import { revalidatePath, updateTag, unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { hashPin, verifyPin, generatePin } from "@/lib/pin"
import {
  deriveStatus,
  ACTION_ALLOWED,
  CONFIRM_MESSAGE,
  isValidPinFormat,
  type CheckType,
  type AttendanceLogRow,
  type AttendanceStatus,
} from "@/lib/attendance-status"
import { todayKst, addDaysKst, kstDateToIso } from "@/lib/date-kst"

export type KioskStaff = {
  id: string
  name: string
  status: AttendanceStatus
  breakCount: number
  positionId: string | null
  checkedInAt: string | null
  onBreakSinceAt: string | null
}

function todayRangeIso() {
  const day = todayKst()
  return { from: kstDateToIso(day), to: kstDateToIso(addDaysKst(day, 1)) }
}

/**
 * 출퇴근 키오스크 대상은 별도 명단이 아니라 기존 employees 중 SP 파트 소속 직원이다.
 * parts 테이블은 소규모 고정 마스터라 매번 code로 조회해도 부담이 없다.
 */
async function getSpPartId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await admin.from("parts").select("id").eq("code", "SP").maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** PIN이 발급된 employees.id 집합 — tb_sp_staff_auth는 employees 마스터와 분리된 별도 테이블. */
async function getIssuedStaffIds(
  admin: ReturnType<typeof createAdminClient>,
  employeeIds: string[],
): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set()
  const { data } = await admin.from("tb_sp_staff_auth").select("staff_id").in("staff_id", employeeIds)
  return new Set((data ?? []).map((row) => row.staff_id as string))
}

// 매장별 키오스크 직원 목록 캐시 태그 — 로그인 직후 예열하고, 출퇴근 기록·PIN 발급/재발급 시 무효화한다.
// 매장 단위로 태그를 나눠 다른 매장 데이터가 섞이지 않게 한다(공용 테이블 캐시와 달리 매장 스코핑 필요).
const kioskStaffTag = (storeId: string) => `kiosk-staff:${storeId}`

async function fetchKioskStaff(storeId: string): Promise<KioskStaff[]> {
  const admin = createAdminClient()
  const spPartId = await getSpPartId(admin)
  if (!spPartId) return []

  const { from, to } = todayRangeIso()

  const [{ data: employeeRows, error: employeeError }, { data: logRows, error: logError }] = await Promise.all([
    admin
      .from("employees")
      .select("id, name, position_id")
      .eq("store_id", storeId)
      .eq("part_id", spPartId)
      .order("name", { ascending: true }),
    admin
      .from("tb_sp_attendance_log")
      .select("staff_id, check_type, checked_at")
      .eq("store_id", storeId)
      .gte("checked_at", from)
      .lt("checked_at", to),
  ])

  if (employeeError) throw new Error(employeeError.message)
  if (logError) throw new Error(logError.message)

  const issuedIds = await getIssuedStaffIds(admin, (employeeRows ?? []).map((row) => row.id as string))

  const logsByStaff = new Map<string, AttendanceLogRow[]>()
  for (const row of logRows ?? []) {
    const list = logsByStaff.get(row.staff_id as string) ?? []
    list.push({ check_type: row.check_type as CheckType, checked_at: row.checked_at as string })
    logsByStaff.set(row.staff_id as string, list)
  }

  return (employeeRows ?? [])
    .filter((row) => issuedIds.has(row.id as string))
    .map((row) => {
      const { status, breakCount, checkedInAt, onBreakSinceAt } = deriveStatus(
        logsByStaff.get(row.id as string) ?? [],
      )
      return {
        id: row.id as string,
        name: row.name as string,
        status,
        breakCount,
        positionId: (row.position_id as string | null) ?? null,
        checkedInAt,
        onBreakSinceAt,
      }
    })
}

/**
 * 매장별 키오스크 직원 목록을 Next.js Data Cache에 60초간 캐싱한다(쓰기 시 updateTag로 즉시 무효화).
 * 오늘 날짜를 캐시 키에 포함해 자정이 지나면 자연스럽게 새 캐시 항목을 쓰도록 한다.
 */
function getCachedKioskStaff(storeId: string): Promise<KioskStaff[]> {
  const cached = unstable_cache(
    () => fetchKioskStaff(storeId),
    [`kiosk-staff:${storeId}:${todayKst()}`],
    { tags: [kioskStaffTag(storeId)], revalidate: 60 },
  )
  return cached()
}

/**
 * 로그인 직후 해당 매장의 키오스크 직원 캐시를 미리 데운다.
 * app/actions/auth.ts의 signIn()이 next/server의 after()로 응답을 막지 않고 백그라운드에서 호출한다.
 * 실패해도 로그인 자체엔 영향 없도록 무시한다.
 */
export async function warmAttendanceCache(storeId: string): Promise<void> {
  await getCachedKioskStaff(storeId).catch(() => {})
}

/**
 * 오늘의 SP 직원 목록 + 상태를 매장 스코핑해 조회한다. PIN이 아직 발급되지 않은 직원은 키오스크에서
 * 인증할 방법이 없으므로 목록에서 제외한다.
 */
export async function getKioskData(): Promise<{ staff: KioskStaff[] } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없어 출퇴근 화면을 사용할 수 없습니다." }

  try {
    const staff = await getCachedKioskStaff(employee.storeId)
    return { staff }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "직원 목록을 불러오지 못했습니다." }
  }
}

/**
 * 액션 버튼 탭 → PIN 확인 → 출퇴근 로그 기록. 상태 전이는 클라이언트가 아니라 서버에서 다시 계산해 검증한다.
 */
export async function checkAttendance(
  staffId: string,
  checkType: CheckType,
  pin: string,
): Promise<
  | {
      success: true
      message: string
      staffName: string
      checkedInAt: string | null
      onBreakSinceAt: string | null
    }
  | { error: string }
> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }
  if (!isValidPinFormat(pin)) return { error: "PIN은 4자리 숫자입니다." }

  const admin = createAdminClient()
  const spPartId = await getSpPartId(admin)

  const [{ data: staffRow, error: staffError }, { data: authRow, error: authError }] = await Promise.all([
    admin.from("employees").select("id, name, store_id, part_id").eq("id", staffId).maybeSingle(),
    admin.from("tb_sp_staff_auth").select("pin_hash").eq("staff_id", staffId).maybeSingle(),
  ])

  if (staffError) return { error: staffError.message }
  if (authError) return { error: authError.message }
  if (!staffRow || staffRow.store_id !== employee.storeId || staffRow.part_id !== spPartId || !authRow) {
    return { error: "직원 정보를 찾을 수 없습니다." }
  }

  const pinOk = await verifyPin(pin, authRow.pin_hash as string)
  if (!pinOk) return { error: "PIN이 일치하지 않습니다." }

  const { from, to } = todayRangeIso()
  const { data: logRows, error: logError } = await admin
    .from("tb_sp_attendance_log")
    .select("check_type, checked_at")
    .eq("staff_id", staffId)
    .gte("checked_at", from)
    .lt("checked_at", to)

  if (logError) return { error: logError.message }

  const { status } = deriveStatus((logRows ?? []) as AttendanceLogRow[])
  if (!ACTION_ALLOWED[status].includes(checkType)) {
    return { error: "현재 상태에서는 이 동작을 할 수 없습니다. 화면을 새로고침해 주세요." }
  }

  const { data: insertedRow, error: insertError } = await admin
    .from("tb_sp_attendance_log")
    .insert({
      staff_id: staffId,
      store_id: employee.storeId,
      check_type: checkType,
    })
    .select("checked_at")
    .single()
  if (insertError) return { error: insertError.message }

  updateTag(kioskStaffTag(employee.storeId))
  revalidatePath("/dashboard")

  // 방금 기록한 이벤트까지 포함해 다시 파생해야 정확한 출근/휴게시작 시각을 돌려줄 수 있다
  // (예: 휴게종료 후엔 근무중이 되지만, 화면엔 그날의 최초 출근 시각을 보여줘야 함).
  const afterAction = deriveStatus([
    ...((logRows ?? []) as AttendanceLogRow[]),
    { check_type: checkType, checked_at: insertedRow.checked_at as string },
  ])

  return {
    success: true,
    message: CONFIRM_MESSAGE[checkType],
    staffName: staffRow.name as string,
    checkedInAt: afterAction.checkedInAt,
    onBreakSinceAt: afterAction.onBreakSinceAt,
  }
}

// ── PIN 발급 관리 — 시니어 전용 ─────────────────────────────
// 대상 직원은 별도 등록이 아니라 해당 매장의 SP 파트 employees 그대로. PIN은 employees 마스터와
// 분리된 tb_sp_staff_auth에 해시로만 저장되므로, 발급/재발급 시점에만 평문을 반환하고 이후엔 다시 조회할 수 없다.

export type SpEmployeeRow = {
  id: string
  name: string
  hasPin: boolean
}

export async function listSpEligibleEmployees(): Promise<{ staff: SpEmployeeRow[] } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "권한이 없습니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }

  const admin = createAdminClient()
  const spPartId = await getSpPartId(admin)
  if (!spPartId) return { staff: [] }

  const { data, error } = await admin
    .from("employees")
    .select("id, name")
    .eq("store_id", employee.storeId)
    .eq("part_id", spPartId)
    .order("name", { ascending: true })

  if (error) return { error: error.message }

  const issuedIds = await getIssuedStaffIds(admin, (data ?? []).map((row) => row.id as string))

  return {
    staff: (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      hasPin: issuedIds.has(row.id as string),
    })),
  }
}

export async function reissuePin(
  employeeId: string,
): Promise<{ success: true; pin: string } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "권한이 없습니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }

  const admin = createAdminClient()
  const spPartId = await getSpPartId(admin)

  const { data: target, error: targetError } = await admin
    .from("employees")
    .select("id, store_id, part_id")
    .eq("id", employeeId)
    .maybeSingle()

  if (targetError) return { error: targetError.message }
  if (!target || target.store_id !== employee.storeId || target.part_id !== spPartId) {
    return { error: "직원 정보를 찾을 수 없습니다." }
  }

  const pin = generatePin()
  const pin_hash = await hashPin(pin)
  const { error } = await admin
    .from("tb_sp_staff_auth")
    .upsert({ staff_id: employeeId, pin_hash, updated_at: new Date().toISOString() }, { onConflict: "staff_id" })
  if (error) return { error: error.message }

  // 새로 PIN이 발급되면 키오스크 목록에 바로 나타나야 하므로 캐시를 즉시 무효화한다.
  updateTag(kioskStaffTag(employee.storeId))
  revalidatePath("/dashboard/employees/pin")
  revalidatePath("/dashboard")
  return { success: true, pin }
}
