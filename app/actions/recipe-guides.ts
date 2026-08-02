"use server"

import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { getNextSopCode } from "@/lib/supabase/db"

// 레시피 가이드는 recipe_guides와 방법서(tb_sop_mst)에 같은 id(sop_id)로 동시에 저장되어
// 한 화면의 작성/수정/삭제가 두 테이블에 그대로 동기화된다.
// sop_category는 가이드 분류(자유 텍스트)와 매핑되는 개념이 없어 "COM"(공통)으로 고정한다.
async function syncSopFromGuide(
  admin: ReturnType<typeof createAdminClient>,
  guideId: string,
  title: string,
  content: string,
) {
  const { data: existing } = await admin
    .from("tb_sop_mst")
    .select("sop_id")
    .eq("sop_id", guideId)
    .maybeSingle()

  if (existing) {
    await admin
      .from("tb_sop_mst")
      .update({ sop_title: title, body: content, updated_at: new Date().toISOString() })
      .eq("sop_id", guideId)
  } else {
    const sopCode = await getNextSopCode()
    await admin.from("tb_sop_mst").insert({
      sop_id: guideId,
      sop_code: sopCode,
      sop_category: "COM",
      sop_title: title,
      body: content,
      status: "ACTIVE",
    })
  }
}

export async function createRecipeGuide(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const title = String(formData.get("title") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const content = String(formData.get("content") ?? "").trim()

  if (!title) return { error: "제목을 입력해주세요." }
  if (!content || content === "<p></p>") return { error: "내용을 입력해주세요." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  const guideId = randomUUID()
  const { error } = await admin.from("recipe_guides").insert({
    id: guideId,
    title,
    category: category || null,
    content,
    author_id: userData?.id ?? null,
  })

  if (error) return { error: "레시피 가이드 등록에 실패했습니다." }

  try {
    await syncSopFromGuide(admin, guideId, title, content)
  } catch {
    // 방법서 동기화 실패가 가이드 등록 자체를 막지는 않는다.
  }

  revalidatePath("/dashboard/recipe-guide")
  return { success: true }
}

export async function deleteRecipeGuide(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { error: "잘못된 요청입니다." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  // 삭제는 점장(시니어 직급) 전용 — 버튼 숨김과 별개로 서버에서도 차단
  const employee = await getCurrentEmployee()
  if (!employee?.isSenior) return { error: "점장만 레시피 가이드를 삭제할 수 있습니다." }

  const admin = createAdminClient()
  const { error } = await admin.from("recipe_guides").delete().eq("id", id)

  if (error) return { error: "삭제에 실패했습니다." }

  // 연결된 방법서(tb_sop_mst)도 함께 삭제해 두 테이블을 동기화 상태로 유지한다.
  await admin.from("tb_sop_mst").delete().eq("sop_id", id)

  revalidatePath("/dashboard/recipe-guide")
  return { success: true }
}

export async function updateRecipeGuide(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const id = String(formData.get("id") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const content = String(formData.get("content") ?? "").trim()

  if (!id) return { error: "잘못된 요청입니다." }
  if (!title) return { error: "제목을 입력해주세요." }
  if (!content || content === "<p></p>") return { error: "내용을 입력해주세요." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("recipe_guides")
    .update({ title, category: category || null, content })
    .eq("id", id)

  if (error) return { error: "수정에 실패했습니다." }

  try {
    await syncSopFromGuide(admin, id, title, content)
  } catch {
    // 방법서 동기화 실패가 가이드 수정 자체를 막지는 않는다.
  }

  revalidatePath("/dashboard/recipe-guide")
  return { success: true }
}
