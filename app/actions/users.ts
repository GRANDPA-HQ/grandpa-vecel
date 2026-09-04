"use server"

import { revalidatePath } from "next/cache"
import { SUPABASE_URL } from "@/lib/supabase/config"

async function patchUser(userId: unknown, payload: Record<string, unknown>) {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(String(userId))}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`업데이트 실패 (${res.status}): ${text}`)
  }

  revalidatePath("/dashboard/employees")
}

export async function updateUserStatus(userId: unknown, status: string) {
  await patchUser(userId, { status })
}

export async function updateUserPosition(userId: unknown, positionId: string) {
  await patchUser(userId, { position_id: positionId })
}

export async function updateUserField(userId: unknown, field: string, value: string) {
  await patchUser(userId, { [field]: value })
}

// employees와 users(레거시 호환)가 공유하는 컬럼 — 직원 정보 수정 시 함께 동기화
const USER_SYNC_FIELDS = new Set(["name", "email", "position_id", "status"])

/**
 * 직원(employees) 필드 수정. 빈 문자열은 null로 저장한다.
 * 이름/이메일/직책/상태는 작성자 표시 등에 쓰이는 users 테이블에도 함께 반영한다.
 */
export async function updateEmployeeField(
  employeeId: string,
  field: string,
  value: string,
): Promise<{ error: string | null }> {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const payload = { [field]: value === "" ? null : value }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/employees?id=eq.${encodeURIComponent(employeeId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    return { error: `수정 실패 (${res.status}): ${text.slice(0, 200)}` }
  }

  if (USER_SYNC_FIELDS.has(field)) {
    // 레거시 users 행 동기화 (없거나 실패해도 무시)
    await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(employeeId)}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }

  revalidatePath("/dashboard/employees")
  return { error: null }
}

/**
 * 직원 상태(재직/휴직/퇴사)와 퇴사일자를 한 번에 갱신한다. 퇴사로 바꾸는 순간 퇴사일자를
 * 같이 저장해야 "재직·휴직=null / 퇴사=날짜" 규칙이 중간 상태 없이 항상 유지된다.
 */
export async function updateEmployeeStatus(
  employeeId: string,
  status: string,
  resignedAt: string | null,
): Promise<{ error: string | null }> {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const payload = { status, resigned_at: resignedAt }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/employees?id=eq.${encodeURIComponent(employeeId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    return { error: `수정 실패 (${res.status}): ${text.slice(0, 200)}` }
  }

  // status는 레거시 호환 users 테이블에도 함께 반영 (없거나 실패해도 무시)
  await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(employeeId)}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status }),
  }).catch(() => {})

  revalidatePath("/dashboard/employees")
  return { error: null }
}
