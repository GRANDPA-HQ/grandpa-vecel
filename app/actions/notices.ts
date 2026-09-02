"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { verifyPin } from "@/lib/pin"
import { isValidPinFormat } from "@/lib/attendance-status"

export type ActiveNotice = {
  id: string
  title: string
  unread: number
  total: number
  targetPositionId: string | null
}

export type NoticeSummary = {
  id: string
  title: string
  body: string | null
  createdAt: string
  ackCount: number
  totalStaff: number
  targetPositionId: string | null
}

type EligibleStaff = { id: string; positionId: string | null }

async function getSpPartId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await admin.from("parts").select("id").eq("code", "SP").maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** 매장 SP 파트 + PIN 발급 완료 직원 목록(직책 포함) — 공지 대상/미확인수 계산의 기준 모집단. */
async function getEligibleStaff(admin: ReturnType<typeof createAdminClient>, storeId: string): Promise<EligibleStaff[]> {
  const spPartId = await getSpPartId(admin)
  if (!spPartId) return []

  const { data: employeeRows } = await admin
    .from("employees")
    .select("id, position_id")
    .eq("store_id", storeId)
    .eq("part_id", spPartId)

  const ids = (employeeRows ?? []).map((row) => row.id as string)
  if (ids.length === 0) return []

  const { data: authRows } = await admin.from("tb_sp_staff_auth").select("staff_id").in("staff_id", ids)
  const issuedIds = new Set((authRows ?? []).map((row) => row.staff_id as string))

  return (employeeRows ?? [])
    .filter((row) => issuedIds.has(row.id as string))
    .map((row) => ({ id: row.id as string, positionId: (row.position_id as string | null) ?? null }))
}

function targetSubset(staff: EligibleStaff[], targetPositionId: string | null): EligibleStaff[] {
  return targetPositionId ? staff.filter((s) => s.positionId === targetPositionId) : staff
}

/** 공지별 확인(ack)한 staff_id 집합 */
async function getAckStaffSets(
  admin: ReturnType<typeof createAdminClient>,
  noticeIds: string[],
): Promise<Map<string, Set<string>>> {
  const byNotice = new Map<string, Set<string>>()
  if (noticeIds.length === 0) return byNotice

  const { data: ackRows } = await admin.from("tb_notice_ack").select("notice_id, staff_id").in("notice_id", noticeIds)
  for (const row of ackRows ?? []) {
    const noticeId = row.notice_id as string
    const set = byNotice.get(noticeId) ?? new Set<string>()
    set.add(row.staff_id as string)
    byNotice.set(noticeId, set)
  }
  return byNotice
}

/**
 * 매장 전체(또는 지정된 직책) 기준 "진행중" 공지 목록 — 대상 중 1명이라도 미확인이면 노출, 전원 확인 시 목록에서 빠진다.
 */
export async function getActiveNotices(): Promise<{ notices: ActiveNotice[] } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }

  const admin = createAdminClient()

  const [eligibleStaff, { data: noticeRows, error: noticeError }] = await Promise.all([
    getEligibleStaff(admin, employee.storeId),
    admin
      .from("tb_notice")
      .select("id, title, target_position_id")
      .eq("store_id", employee.storeId)
      .order("created_at", { ascending: false }),
  ])

  if (noticeError) return { error: noticeError.message }

  const noticeIds = (noticeRows ?? []).map((n) => n.id as string)
  if (noticeIds.length === 0 || eligibleStaff.length === 0) return { notices: [] }

  const ackStaffByNotice = await getAckStaffSets(admin, noticeIds)

  const notices: ActiveNotice[] = (noticeRows ?? [])
    .map((n) => {
      const targetPositionId = (n.target_position_id as string | null) ?? null
      const subset = targetSubset(eligibleStaff, targetPositionId)
      const ackedSet = ackStaffByNotice.get(n.id as string) ?? new Set<string>()
      const acked = subset.filter((s) => ackedSet.has(s.id)).length
      return {
        id: n.id as string,
        title: n.title as string,
        unread: subset.length - acked,
        total: subset.length,
        targetPositionId,
      }
    })
    .filter((n) => n.total > 0 && n.unread > 0)

  return { notices }
}

/**
 * 전체 공지함 — 진행중 여부와 관계없이 매장의 모든 공지를 최신순으로 보여준다.
 */
export async function listNotices(): Promise<{ notices: NoticeSummary[] } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }

  const admin = createAdminClient()

  const [eligibleStaff, { data: noticeRows, error: noticeError }] = await Promise.all([
    getEligibleStaff(admin, employee.storeId),
    admin
      .from("tb_notice")
      .select("id, title, body, created_at, target_position_id")
      .eq("store_id", employee.storeId)
      .order("created_at", { ascending: false }),
  ])

  if (noticeError) return { error: noticeError.message }

  const noticeIds = (noticeRows ?? []).map((n) => n.id as string)
  const ackStaffByNotice = await getAckStaffSets(admin, noticeIds)

  const notices: NoticeSummary[] = (noticeRows ?? []).map((n) => {
    const targetPositionId = (n.target_position_id as string | null) ?? null
    const subset = targetSubset(eligibleStaff, targetPositionId)
    const ackedSet = ackStaffByNotice.get(n.id as string) ?? new Set<string>()
    const acked = subset.filter((s) => ackedSet.has(s.id)).length
    return {
      id: n.id as string,
      title: n.title as string,
      body: n.body as string | null,
      createdAt: n.created_at as string,
      ackCount: acked,
      totalStaff: subset.length,
      targetPositionId,
    }
  })

  return { notices }
}

/**
 * 새 공지 작성 — 시니어 전용. targetPositionId가 null이면 해당 매장 SP 파트 전체 대상.
 * storeId는 작성 화면에서 지정한 대상 지점 — 시니어는 이 앱의 다른 관리 기능과 동일하게
 * 자기 소속 매장 외에도 아무 지점에나 공지를 등록할 수 있다.
 */
export async function createNotice(
  title: string,
  body: string,
  targetPositionId: string | null,
  storeId: string,
): Promise<{ success: true } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "권한이 없습니다." }
  if (!title.trim()) return { error: "제목을 입력해 주세요." }
  if (!storeId) return { error: "지점을 선택해 주세요." }

  const admin = createAdminClient()
  const { error } = await admin.from("tb_notice").insert({
    store_id: storeId,
    title: title.trim(),
    body: body.trim() || null,
    created_by: employee.id,
    target_position_id: targetPositionId,
  })

  if (error) return { error: error.message }

  revalidatePath("/dashboard/attendance/notices")
  revalidatePath("/dashboard")
  return { success: true }
}

/**
 * 공지 확인 미니플로우 — 이름선택→PIN 후 ack. 대상 직책이 지정된 공지는 해당 직책 직원만 확인할 수 있다.
 * 중복 확인 시도는 에러가 아니라 성공으로 처리한다.
 */
export async function ackNotice(
  staffId: string,
  noticeId: string,
  pin: string,
): Promise<{ success: true } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.storeId) return { error: "소속 매장이 없습니다." }
  if (!isValidPinFormat(pin)) return { error: "PIN은 4자리 숫자입니다." }

  const admin = createAdminClient()
  const spPartId = await getSpPartId(admin)

  const [{ data: staffRow, error: staffError }, { data: authRow, error: authError }, { data: noticeRow, error: noticeError }] =
    await Promise.all([
      admin.from("employees").select("id, store_id, part_id, position_id").eq("id", staffId).maybeSingle(),
      admin.from("tb_sp_staff_auth").select("pin_hash").eq("staff_id", staffId).maybeSingle(),
      admin.from("tb_notice").select("target_position_id").eq("id", noticeId).maybeSingle(),
    ])

  if (staffError) return { error: staffError.message }
  if (authError) return { error: authError.message }
  if (noticeError) return { error: noticeError.message }
  if (!staffRow || staffRow.store_id !== employee.storeId || staffRow.part_id !== spPartId || !authRow) {
    return { error: "직원 정보를 찾을 수 없습니다." }
  }

  const targetPositionId = (noticeRow?.target_position_id as string | null) ?? null
  if (targetPositionId && targetPositionId !== staffRow.position_id) {
    return { error: "이 공지는 해당 직원의 직책 대상이 아닙니다." }
  }

  const pinOk = await verifyPin(pin, authRow.pin_hash as string)
  if (!pinOk) return { error: "PIN이 일치하지 않습니다." }

  const { error: ackError } = await admin
    .from("tb_notice_ack")
    .upsert({ notice_id: noticeId, staff_id: staffId }, { onConflict: "notice_id,staff_id", ignoreDuplicates: true })

  if (ackError) return { error: ackError.message }

  revalidatePath("/dashboard/attendance/notices")
  return { success: true }
}
