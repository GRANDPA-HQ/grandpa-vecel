"use server"

import { createClient as createAdminClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

const DEFAULT_PASSWORD = "1111"

function createAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// 호출자가 점장인지 확인 (직원 관리 페이지와 동일한 기준)
async function requireManager(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdmin()
  const { data: userData } = await admin
    .from("users")
    .select("positions(name_ko)")
    .eq("id", user.id)
    .single()

  const positionName =
    (userData?.positions as unknown as { name_ko: string } | null)?.name_ko ?? ""
  if (positionName !== "점장") return { error: "점장만 직원을 관리할 수 있습니다." }
  return { userId: user.id }
}

async function getStaffPositionId(admin: ReturnType<typeof createAdmin>): Promise<string | null> {
  const { data } = await admin.from("positions").select("*")
  const positions = (data ?? []) as Record<string, unknown>[]
  if (positions.length === 0) return null
  // name_ko 컬럼에서 '스태프' 검색, 없으면 첫 번째 행
  const staff = positions.find(
    (p) => typeof p.name_ko === "string" && p.name_ko.includes("스태프"),
  )
  return String((staff ?? positions[0]).id)
}

export type InviteState = {
  error?: string
  success?: boolean
  email?: string
}

/**
 * 직원 추가: 계정을 즉시 생성한다 (아이디 = 이메일, 비밀번호 = 1111).
 * 이메일 확인 절차 없이 바로 로그인 가능한 상태로 만들어지므로,
 * 아이디/비밀번호를 직원에게 직접 전달하면 된다.
 */
export async function inviteEmployee(
  _prevState: InviteState | undefined,
  formData: FormData,
): Promise<InviteState> {
  const auth = await requireManager()
  if ("error" in auth) return { error: auth.error }

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!email) return { error: "이메일을 입력해주세요." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "올바른 이메일 형식이 아닙니다." }

  const admin = createAdmin()

  // 이미 등록된 직원인지 확인
  const { data: existingUser } = await admin
    .from("users")
    .select("email")
    .eq("email", email)
    .maybeSingle()
  if (existingUser) return { error: "이미 등록된 직원 이메일입니다." }

  // 1) 인증 계정 즉시 생성 (이메일 확인 절차 없이 바로 로그인 가능)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
  })
  if (createError || !created.user) {
    const msg = createError?.message ?? ""
    if (/already|registered|exists/i.test(msg)) return { error: "이미 가입된 이메일입니다." }
    return { error: `계정 생성에 실패했습니다. ${msg}` }
  }

  // 2) 직원 테이블에 등록 (기본 직책: 스태프, 상태: 재직)
  const positionId = await getStaffPositionId(admin)
  const { error: insertError } = await admin.from("users").insert({
    id: created.user.id,
    email,
    name: email.split("@")[0],
    ...(positionId ? { position_id: positionId } : {}),
    status: "재직",
  })
  if (insertError) {
    // 직원 등록 실패 시 계정도 되돌린다
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    return { error: `직원 등록에 실패했습니다. ${insertError.message}` }
  }

  revalidatePath("/dashboard/employees")
  return { success: true, email }
}

/**
 * 직원 삭제: 직원 테이블과 인증 계정을 함께 삭제한다.
 */
export async function deleteEmployee(userId: string): Promise<{ error: string | null }> {
  const auth = await requireManager()
  if ("error" in auth) return { error: auth.error }
  if (auth.userId === userId) return { error: "본인 계정은 삭제할 수 없습니다." }

  const admin = createAdmin()

  // 1) 인증 계정 삭제 (계정이 이미 없는 경우는 계속 진행)
  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  if (authError && !/not.?found/i.test(authError.message)) {
    return { error: `계정 삭제에 실패했습니다. ${authError.message}` }
  }

  // 2) 직원 테이블에서 삭제
  const { error: rowError } = await admin.from("users").delete().eq("id", userId)
  if (rowError) return { error: `직원 삭제에 실패했습니다. ${rowError.message}` }

  revalidatePath("/dashboard/employees")
  return { error: null }
}
