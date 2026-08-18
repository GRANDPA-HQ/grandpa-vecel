"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type RecipeInput = {
  // 구성 재료가 원재료(tb_raw_mst)인지 다른 생산품(tb_prod_mst)인지 — 예: 요거트랜치믹스를
  // 만들어두고 그걸 재료로 요거트랜치드레싱을 만드는 경우 "prod"를 사용한다
  ingredientType: "raw" | "prod"
  ingredientId: string
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

  if (rows.some((r) => r.ingredientType === "prod" && r.ingredientId === prodId)) {
    return { error: "생산품은 자기 자신을 재료로 사용할 수 없습니다." }
  }

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
      raw_id: r.ingredientType === "raw" ? r.ingredientId : null,
      ingredient_prod_id: r.ingredientType === "prod" ? r.ingredientId : null,
      amount: r.amount,
      unit: r.unit,
      memo: r.memo || null,
      sort_order: i,
    }))
    let { error: insertError } = await admin.from("tb_prod_recipe").insert(values)
    // ingredient_prod_id/sort_order 컬럼이 아직 없는 DB에서도 저장은 되도록 폴백
    // (ingredient_prod_id가 없는 DB에서는 생산품을 재료로 쓰는 행만 저장 실패로 안내)
    if (insertError && /ingredient_prod_id/i.test(insertError.message)) {
      if (values.some((v) => v.ingredient_prod_id)) {
        return {
          error:
            "생산품을 재료로 사용하려면 DB 마이그레이션(ingredient_prod_id 컬럼 추가)이 먼저 필요합니다.",
        }
      }
      ;({ error: insertError } = await admin
        .from("tb_prod_recipe")
        .insert(values.map(({ ingredient_prod_id: _ip, ...v }) => v)))
    }
    if (insertError && /sort_order/i.test(insertError.message)) {
      ;({ error: insertError } = await admin
        .from("tb_prod_recipe")
        .insert(values.map(({ sort_order: _so, ...v }) => v)))
    }
    if (insertError) return { error: insertError.message }
  }

  revalidatePath("/dashboard/prod-recipe-write")
  revalidatePath("/dashboard/data-table/tb_prod_recipe")
  revalidatePath("/dashboard/production-write")
  return { success: true }
}
