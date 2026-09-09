"use server"

import { revalidatePath, updateTag, unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { hashPin, verifyPin, generatePin } from "@/lib/pin"
import {
  deriveStatus,
  summarizeDay,
  ACTION_ALLOWED,
  CONFIRM_MESSAGE,
  isValidPinFormat,
  type CheckType,
  type AttendanceLogRow,
  type AttendanceStatus,
  type BreakPeriod,
} from "@/lib/attendance-status"
import {
  todayKst,
  addDaysKst,
  addMonthsKst,
  kstDateToIso,
  kstDateTimeToIso,
  isoToKstDate,
  isValidDateStr,
  isValidMonthStr,
} from "@/lib/date-kst"

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

// ── 근태관리(출퇴근 이력) 조회/수정 — 시니어(매니저 이상) 전용 ─────────────────────────────

export type AttendanceDayRow = {
  staffId: string
  staffName: string
  date: string
  checkIn: string | null
  checkOut: string | null
  workMinutes: number
  breakMinutes: number
  breakPeriods: BreakPeriod[]
  stillWorking: boolean
  stillOnBreak: boolean
}

export type AttendanceMonthlyTotal = {
  staffId: string
  staffName: string
  workDays: number
  workMinutes: number
  breakMinutes: number
}

/** 대상 직원이 호출자와 같은 매장의 SP 파트 소속인지 확인하고, 없으면 에러를 돌려준다. */
async function resolveSpStaff(
  admin: ReturnType<typeof createAdminClient>,
  employee: NonNullable<Awaited<ReturnType<typeof getCurrentEmployee>>>,
  staffId: string,
): Promise<{ staff: { id: string; name: string } } | { error: string }> {
  const spPartId = await getSpPartId(admin)
  const { data: target, error } = await admin
    .from("employees")
    .select("id, name, store_id, part_id")
    .eq("id", staffId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!target || target.store_id !== employee.storeId || target.part_id !== spPartId) {
    return { error: "직원 정보를 찾을 수 없습니다." }
  }
  return { staff: { id: target.id as string, name: target.name as string } }
}

/**
 * 매장 SP 직원의 월간 근태 합계를 조회한다. 그 달에 로그가 하나도 없는 직원도 0으로 포함해
 * "근무 기록 없음"을 구분할 수 있게 한다.
 */
export async function getAttendanceHistory(
  month: string,
): Promise<{ month: string; totals: AttendanceMonthlyTotal[] } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "권한이 없습니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }
  if (!isValidMonthStr(month)) return { error: "잘못된 월 형식입니다." }

  const admin = createAdminClient()
  const spPartId = await getSpPartId(admin)
  if (!spPartId) return { month, totals: [] }

  const monthStart = `${month}-01`
  const from = kstDateToIso(monthStart)
  const to = kstDateToIso(addMonthsKst(monthStart, 1))

  const [{ data: employeeRows, error: employeeError }, { data: logRows, error: logError }] = await Promise.all([
    admin
      .from("employees")
      .select("id, name")
      .eq("store_id", employee.storeId)
      .eq("part_id", spPartId)
      .order("name", { ascending: true }),
    admin
      .from("tb_sp_attendance_log")
      .select("staff_id, check_type, checked_at")
      .eq("store_id", employee.storeId)
      .gte("checked_at", from)
      .lt("checked_at", to),
  ])

  if (employeeError) return { error: employeeError.message }
  if (logError) return { error: logError.message }

  const nameById = new Map((employeeRows ?? []).map((row) => [row.id as string, row.name as string]))

  const byStaffDate = new Map<string, Map<string, AttendanceLogRow[]>>()
  for (const row of logRows ?? []) {
    const staffId = row.staff_id as string
    const date = isoToKstDate(row.checked_at as string)
    let byDate = byStaffDate.get(staffId)
    if (!byDate) {
      byDate = new Map()
      byStaffDate.set(staffId, byDate)
    }
    const list = byDate.get(date) ?? []
    list.push({ check_type: row.check_type as CheckType, checked_at: row.checked_at as string })
    byDate.set(date, list)
  }

  const totalsMap = new Map<string, AttendanceMonthlyTotal>()
  for (const row of employeeRows ?? []) {
    totalsMap.set(row.id as string, {
      staffId: row.id as string,
      staffName: row.name as string,
      workDays: 0,
      workMinutes: 0,
      breakMinutes: 0,
    })
  }

  for (const [staffId, byDate] of byStaffDate) {
    const staffName = nameById.get(staffId) ?? "(탈퇴한 직원)"
    if (!totalsMap.has(staffId)) {
      totalsMap.set(staffId, { staffId, staffName, workDays: 0, workMinutes: 0, breakMinutes: 0 })
    }
    const total = totalsMap.get(staffId)!

    for (const logs of byDate.values()) {
      const summary = summarizeDay(logs)
      if (summary.checkIn) total.workDays += 1
      total.workMinutes += summary.workMinutes
      total.breakMinutes += summary.breakMinutes
    }
  }

  const totals = [...totalsMap.values()].sort((a, b) => a.staffName.localeCompare(b.staffName, "ko"))

  return { month, totals }
}

/** 특정 직원의 월간 일별 근태 내역을 조회한다 (직원 클릭 시 이동하는 상세 페이지용). */
export async function getStaffAttendanceMonth(
  staffId: string,
  month: string,
): Promise<{ staffName: string; month: string; days: AttendanceDayRow[] } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "권한이 없습니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }
  if (!isValidMonthStr(month)) return { error: "잘못된 월 형식입니다." }

  const admin = createAdminClient()
  const resolved = await resolveSpStaff(admin, employee, staffId)
  if ("error" in resolved) return resolved

  const monthStart = `${month}-01`
  const from = kstDateToIso(monthStart)
  const to = kstDateToIso(addMonthsKst(monthStart, 1))

  const { data: logRows, error: logError } = await admin
    .from("tb_sp_attendance_log")
    .select("check_type, checked_at")
    .eq("staff_id", staffId)
    .gte("checked_at", from)
    .lt("checked_at", to)
  if (logError) return { error: logError.message }

  const byDate = new Map<string, AttendanceLogRow[]>()
  for (const row of logRows ?? []) {
    const date = isoToKstDate(row.checked_at as string)
    const list = byDate.get(date) ?? []
    list.push({ check_type: row.check_type as CheckType, checked_at: row.checked_at as string })
    byDate.set(date, list)
  }

  const days: AttendanceDayRow[] = [...byDate.entries()]
    .map(([date, logs]) => ({ staffId, staffName: resolved.staff.name, date, ...summarizeDay(logs) }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return { staffName: resolved.staff.name, month, days }
}

function isValidTimeStr(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export type AttendanceBreakInput = { start: string; end: string | null }

/**
 * 하루치 출퇴근 로그를 통째로 교체한다(append-only 로그이지만, 수정은 그날 이벤트를 지우고
 * 편집된 시간으로 다시 쌓는 방식이 개별 행을 대응시키는 것보다 단순하고 안전하다).
 * 상태 전이 규칙(ACTION_ALLOWED)을 그대로 재사용해 저장 전에 시간 순서가 말이 되는지 검증한다.
 * 로그가 없던 날짜에 대해 호출하면 새 기록 추가로 동작한다.
 */
export async function updateAttendanceDay(
  staffId: string,
  date: string,
  input: { checkIn: string | null; checkOut: string | null; breaks: AttendanceBreakInput[] },
): Promise<{ success: true } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "권한이 없습니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }
  if (!isValidDateStr(date)) return { error: "잘못된 날짜 형식입니다." }

  const admin = createAdminClient()
  const resolved = await resolveSpStaff(admin, employee, staffId)
  if ("error" in resolved) return resolved

  type Event = { check_type: CheckType; time: string }
  const events: Event[] = []

  if (input.checkIn) {
    if (!isValidTimeStr(input.checkIn)) return { error: "출근 시간 형식이 올바르지 않습니다." }
    events.push({ check_type: "IN", time: input.checkIn })
  }
  for (const b of input.breaks) {
    if (!isValidTimeStr(b.start)) return { error: "휴게 시작 시간 형식이 올바르지 않습니다." }
    events.push({ check_type: "BREAK_START", time: b.start })
    if (b.end) {
      if (!isValidTimeStr(b.end)) return { error: "휴게 종료 시간 형식이 올바르지 않습니다." }
      events.push({ check_type: "BREAK_END", time: b.end })
    }
  }
  if (input.checkOut) {
    if (!isValidTimeStr(input.checkOut)) return { error: "퇴근 시간 형식이 올바르지 않습니다." }
    events.push({ check_type: "OUT", time: input.checkOut })
  }

  events.sort((a, b) => a.time.localeCompare(b.time))

  // 정렬된 이벤트가 출퇴근 상태 기계 순서를 지키는지 검증 (예: 휴게 종료가 시작보다 먼저 오는 경우 등을 차단)
  let status: AttendanceStatus = "BEFORE_WORK"
  for (const e of events) {
    if (!ACTION_ALLOWED[status].includes(e.check_type)) {
      return { error: "출근/휴게/퇴근 시간 순서가 올바르지 않습니다." }
    }
    status = e.check_type === "BREAK_START" ? "ON_BREAK" : e.check_type === "OUT" ? "DONE" : "WORKING"
  }

  const from = kstDateToIso(date)
  const to = kstDateToIso(addDaysKst(date, 1))

  const { error: deleteError } = await admin
    .from("tb_sp_attendance_log")
    .delete()
    .eq("staff_id", staffId)
    .gte("checked_at", from)
    .lt("checked_at", to)
  if (deleteError) return { error: deleteError.message }

  if (events.length > 0) {
    const { error: insertError } = await admin.from("tb_sp_attendance_log").insert(
      events.map((e) => ({
        staff_id: staffId,
        store_id: employee.storeId,
        check_type: e.check_type,
        checked_at: kstDateTimeToIso(date, e.time),
      })),
    )
    if (insertError) return { error: insertError.message }
  }

  // 수정한 날짜가 오늘이면 키오스크 화면의 현재 상태도 즉시 바뀌어야 하므로 캐시를 함께 무효화한다.
  if (date === todayKst()) {
    updateTag(kioskStaffTag(employee.storeId))
    revalidatePath("/dashboard")
  }
  revalidatePath("/dashboard/attendance/history")
  revalidatePath(`/dashboard/attendance/history/${staffId}`)

  return { success: true }
}

/** 하루치 출퇴근 기록을 통째로 삭제한다. */
export async function deleteAttendanceDay(
  staffId: string,
  date: string,
): Promise<{ success: true } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "권한이 없습니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }
  if (!isValidDateStr(date)) return { error: "잘못된 날짜 형식입니다." }

  const admin = createAdminClient()
  const resolved = await resolveSpStaff(admin, employee, staffId)
  if ("error" in resolved) return resolved

  const from = kstDateToIso(date)
  const to = kstDateToIso(addDaysKst(date, 1))

  const { error: deleteError } = await admin
    .from("tb_sp_attendance_log")
    .delete()
    .eq("staff_id", staffId)
    .gte("checked_at", from)
    .lt("checked_at", to)
  if (deleteError) return { error: deleteError.message }

  if (date === todayKst()) {
    updateTag(kioskStaffTag(employee.storeId))
    revalidatePath("/dashboard")
  }
  revalidatePath("/dashboard/attendance/history")
  revalidatePath(`/dashboard/attendance/history/${staffId}`)

  return { success: true }
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
