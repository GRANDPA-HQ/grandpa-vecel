"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type RecipeInput = {
  rawId: string
  amount: number
  unit: string
  memo: string
}

export async function saveProdRecipe(
  prodId: string,
  rows: RecipeInput[],
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()

  // 해당 생산품의 기존 레시피 전체 삭제 후 재삽입
  const { error: deleteError } = await admin
    .from("tb_prod_recipe")
    .delete()
    .eq("prod_id", prodId)

  if (deleteError) return { error: deleteError.message }

  if (rows.length > 0) {
    // 화면에 보이는 행 순서를 sort_order로 저장 (드래그 순서 변경 유지)
    const values = rows.map((r, i) => ({
      prod_id: prodId,
      raw_id: r.rawId,
      amount: r.amount,
      unit: r.unit,
      memo: r.memo || null,
      sort_order: i,
    }))
    let { error: insertError } = await admin.from("tb_prod_recipe").insert(values)
    // sort_order 컬럼이 아직 없는 DB에서도 저장은 되도록 폴백
    if (insertError && /sort_order/i.test(insertError.message)) {
      ;({ error: insertError } = await admin
        .from("tb_prod_recipe")
        .insert(values.map(({ sort_order: _, ...v }) => v)))
    }
    if (insertError) return { error: insertError.message }
  }

  revalidatePath("/dashboard/prod-recipe-write")
  revalidatePath("/dashboard/data-table/tb_prod_recipe")
  return { success: true }
}
