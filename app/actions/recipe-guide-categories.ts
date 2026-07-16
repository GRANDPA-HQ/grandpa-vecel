"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type Result = { error?: string; success?: boolean }

async function requireUser(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return !!user
}

export async function addRecipeGuideCategory(name: string): Promise<Result> {
  if (!(await requireUser())) return { error: "로그인이 필요합니다." }
  const trimmed = name.trim()
  if (!trimmed) return { error: "분류 이름을 입력해주세요." }

  const admin = createAdminClient()
  const { error } = await admin.from("recipe_guide_categories").insert({ name: trimmed })
  if (error) {
    if (error.code === "23505") return { error: `'${trimmed}' 분류가 이미 있습니다.` }
    return { error: error.message }
  }

  revalidatePath("/dashboard/recipe-guide")
  return { success: true }
}

export async function renameRecipeGuideCategory(id: string, newName: string): Promise<Result> {
  if (!(await requireUser())) return { error: "로그인이 필요합니다." }
  const trimmed = newName.trim()
  if (!trimmed) return { error: "분류 이름을 입력해주세요." }

  const admin = createAdminClient()
  const { data: existing, error: fetchError } = await admin
    .from("recipe_guide_categories")
    .select("name")
    .eq("id", id)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!existing) return { error: "분류를 찾을 수 없습니다." }
  if (existing.name === trimmed) return { success: true }

  const { error: updateError } = await admin
    .from("recipe_guide_categories")
    .update({ name: trimmed })
    .eq("id", id)
  if (updateError) {
    if (updateError.code === "23505") return { error: `'${trimmed}' 분류가 이미 있습니다.` }
    return { error: updateError.message }
  }

  // 이 분류를 쓰고 있는 기존 가이드의 분류명도 함께 변경
  const { error: guideError } = await admin
    .from("recipe_guides")
    .update({ category: trimmed })
    .eq("category", existing.name)
  if (guideError) return { error: guideError.message }

  revalidatePath("/dashboard/recipe-guide")
  return { success: true }
}

export async function deleteRecipeGuideCategory(id: string): Promise<Result> {
  if (!(await requireUser())) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()
  // 분류 목록에서만 제거 — 이 분류를 쓰던 기존 가이드의 표시는 그대로 유지된다
  const { error } = await admin.from("recipe_guide_categories").delete().eq("id", id)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/recipe-guide")
  return { success: true }
}
