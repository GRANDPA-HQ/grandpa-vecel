"use server"

import { createClient as createAdminClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { getCurrentEmployee } from "@/lib/permissions"

const DEFAULT_PASSWORD = "1111"

function createAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// 호출자가 시니어 직급인지 확인 (직원 관리 권한)
async function requireSenior(): Promise<{ userId: string } | { error: string }> {
  const employee = await getCurrentEmployee()
  if (!employee) return { error: "로그인이 필요합니다." }
  if (!employee.isSenior) return { error: "시니어 직급만 직원을 관리할 수 있습니다." }
  return { userId: employee.id }
}

type Row = Record<string, unknown>

// 신규 직원 기본값: 매장(첫 매장), 파트(정렬 첫 파트), 직책(스태프), 직급(최하위 레벨)
async function getInviteDefaults(admin: ReturnType<typeof createAdmin>) {
  const [stores, parts, positions, ranks] = await Promise.all([
    admin.from("tb_store_mst").select("id").order("created_at").limit(1),
    admin.from("parts").select("id").order("sort_order").limit(1),
    admin.from("positions").select("id, name_ko"),
    admin.from("ranks").select("id, level").order("level").limit(1),
  ])
  const positionRows = (positions.data ?? []) as Row[]
  const staff =
    positionRows.find((p) => typeof p.name_ko === "string" && p.name_ko.includes("스태프")) ??
    positionRows[0]
  return {
    store_id: (stores.data?.[0] as Row | undefined)?.id ?? null,
    part_id: (parts.data?.[0] as Row | undefined)?.id ?? null,
    position_id: staff?.id ?? null,
    rank_id: (ranks.data?.[0] as Row | undefined)?.id ?? null,
  }
}

export type InviteState = {
  error?: string
  success?: boolean
  email?: string
}

/**
 * 직원 추가: 계정을 즉시 생성하고 (아이디 = 이메일, 비밀번호 = 1111)
 * 직원(employees) 테이블에 등록한다. users에도 함께 기록해 작성자 표시 등 기존 기능과 호환.
 */
export async function inviteEmployee(
  _prevState: InviteState | undefined,
  formData: FormData,
): Promise<InviteState> {
  const auth = await requireSenior()
  if ("error" in auth) return { error: auth.error }

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!email) return { error: "이메일을 입력해주세요." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "올바른 이메일 형식이 아닙니다." }

  const admin = createAdmin()

  // 이미 등록된 직원인지 확인
  const { data: existing } = await admin
    .from("employees")
    .select("email")
    .eq("email", email)
    .maybeSingle()
  if (existing) return { error: "이미 등록된 직원 이메일입니다." }

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

  // 2) 직원 테이블에 등록
  const defaults = await getInviteDefaults(admin)
  if (!defaults.store_id || !defaults.part_id || !defaults.position_id || !defaults.rank_id) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    return { error: "매장/파트/직책/직급 기본 데이터가 없어 직원을 등록할 수 없습니다." }
  }

  const name = email.split("@")[0]
  const { error: insertError } = await admin.from("employees").insert({
    id: created.user.id,
    ...defaults,
    name,
    email,
    employment_type: "정규직",
    status: "재직",
    hired_at: new Date().toISOString().slice(0, 10),
  })
  if (insertError) {
    // 직원 등록 실패 시 계정도 되돌린다
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    return { error: `직원 등록에 실패했습니다. ${insertError.message}` }
  }

  // 3) 레거시 users 행 기록 (작성자 표시 등 기존 FK 호환 — 실패해도 무시)
  await admin
    .from("users")
    .insert({
      id: created.user.id,
      email,
      name,
      position_id: defaults.position_id,
      status: "재직",
    })
    .then(
      () => {},
      () => {},
    )

  revalidatePath("/dashboard/employees")
  return { success: true, email }
}

/**
 * 직원 삭제: 직원 테이블, 레거시 users 행, 인증 계정을 함께 삭제한다.
 */
export async function deleteEmployee(employeeId: string): Promise<{ error: string | null }> {
  const auth = await requireSenior()
  if ("error" in auth) return { error: auth.error }
  if (auth.userId === employeeId) return { error: "본인 계정은 삭제할 수 없습니다." }

  const admin = createAdmin()

  // 1) 인증 계정 삭제 (계정이 이미 없는 경우는 계속 진행)
  const { error: authError } = await admin.auth.admin.deleteUser(employeeId)
  if (authError && !/not.?found/i.test(authError.message)) {
    return { error: `계정 삭제에 실패했습니다. ${authError.message}` }
  }

  // 2) 직원 테이블에서 삭제
  const { error: rowError } = await admin.from("employees").delete().eq("id", employeeId)
  if (rowError) return { error: `직원 삭제에 실패했습니다. ${rowError.message}` }

  // 3) 레거시 users 행 삭제 (실패해도 무시)
  await admin.from("users").delete().eq("id", employeeId).then(
    () => {},
    () => {},
  )

  revalidatePath("/dashboard/employees")
  return { error: null }
}
