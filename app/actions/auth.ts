"use server"

import { redirect } from "next/navigation"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { warmMasterTableCaches } from "@/lib/supabase/db"
import { warmAttendanceCache } from "@/app/actions/attendance"
import { warmNoticesCache } from "@/app/actions/notices"

function createAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  }
}

async function getStaffPositionId(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const { data: positions } = await admin.from("positions").select("*")
  if (!positions || positions.length === 0) return null

  // name_ko 컬럼에서 '스태프' 검색, 없으면 첫 번째 행
  const staff = positions.find(
    (p: Record<string, unknown>) => typeof p.name_ko === "string" && p.name_ko.includes("스태프"),
  )
  return String((staff ?? positions[0]).id)
}

export async function signIn(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const { email, password } = readCredentials(formData)
  if (!email || !password) return { error: "Email and password are required." }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  // 응답(리다이렉트)을 지연시키지 않고 백그라운드에서 마스터 데이터 캐시 +
  // 소속 매장의 출퇴근 키오스크/공지 캐시를 미리 데운다
  const userId = data.user?.id
  after(async () => {
    await warmMasterTableCaches()
    if (!userId) return
    const admin = createAdmin()
    const { data: emp } = await admin.from("employees").select("store_id").eq("id", userId).maybeSingle()
    const storeId = emp?.store_id as string | undefined
    if (storeId) {
      await Promise.all([warmAttendanceCache(storeId), warmNoticesCache(storeId)])
    }
  })

  redirect("/dashboard")
}

export async function register(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const { email, password } = readCredentials(formData)
  if (!email || !password) return { error: "Email and password are required." }
  if (password.length < 6) return { error: "Password must be at least 6 characters." }

  // 초대된 이메일인지 확인
  const admin = createAdmin()
  const { data: invitation } = await admin
    .from("invitations")
    .select("email")
    .eq("email", email)
    .maybeSingle()

  if (!invitation) return { error: "초대된 이메일만 가입할 수 있습니다." }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }

  if (data.user) {
    const admin = createAdmin()
    const positionId = await getStaffPositionId(admin)

    if (positionId) {
      // 이름 기본값: 이메일 @ 앞부분
      const defaultName = email.split("@")[0]
      await admin.from("users").insert({
        id: data.user.id,
        email: data.user.email,
        name: defaultName,
        position_id: positionId,
        status: "재직",
      })
    }
  }

  redirect("/dashboard")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

/**
 * 본인 비밀번호 변경: 현재 비밀번호 확인 후 새 비밀번호로 교체한다.
 */
export async function changePassword(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const current = String(formData.get("current") ?? "")
  const next = String(formData.get("next") ?? "")
  const confirm = String(formData.get("confirm") ?? "")

  if (!current || !next) return { error: "현재 비밀번호와 새 비밀번호를 입력해주세요." }
  if (next.length < 6) return { error: "새 비밀번호는 6자 이상이어야 합니다." }
  if (next !== confirm) return { error: "새 비밀번호가 서로 일치하지 않습니다." }
  if (next === current) return { error: "새 비밀번호가 현재 비밀번호와 같습니다." }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: "로그인이 필요합니다." }

  // 현재 비밀번호가 맞는지 확인
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  })
  if (verifyError) return { error: "현재 비밀번호가 올바르지 않습니다." }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) {
    if (/should be different/i.test(error.message))
      return { error: "새 비밀번호가 현재 비밀번호와 같습니다." }
    if (/at least 6|weak/i.test(error.message))
      return { error: "새 비밀번호는 6자 이상이어야 합니다." }
    return { error: `비밀번호 변경에 실패했습니다. ${error.message}` }
  }

  return { success: true }
}
