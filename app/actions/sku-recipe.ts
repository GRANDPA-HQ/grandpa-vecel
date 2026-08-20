"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type RecipeInput = {
  prodId: string
  amount: number
  unit: string
  // "개(ea)" 단위 사용 시 개당 평균 무게(g) — 100g 기준 영양정보로 환산해 합계를 계산하는 데 쓰인다
  avgWeight: number | null
  memo: string
}

export async function saveSkuRecipe(
  skuId: string,
  rows: RecipeInput[],
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다." }

  const admin = createAdminClient()

  // 해당 SKU의 기존 레시피 전체 삭제 후 재삽입
  const { error: deleteError } = await admin
    .from("tb_sku_recipe")
    .delete()
    .eq("sku_id", skuId)

  if (deleteError) return { error: deleteError.message }

  if (rows.length > 0) {
    // 화면에 보이는 행 순서를 sort_order로 저장 (드래그 순서 변경 유지)
    const values = rows.map((r, i) => ({
      sku_id: skuId,
      prod_id: r.prodId,
      amount: r.amount,
      unit: r.unit,
      avg_weight: r.unit === "ea" ? r.avgWeight : null,
      memo: r.memo || null,
      sort_order: i,
    }))
    let { error: insertError } = await admin.from("tb_sku_recipe").insert(values)
    // avg_weight/sort_order 컬럼이 아직 없는 DB에서도 저장은 되도록 폴백
    if (insertError && /avg_weight/i.test(insertError.message)) {
      ;({ error: insertError } = await admin
        .from("tb_sku_recipe")
        .insert(values.map(({ avg_weight: _aw, ...v }) => v)))
    }
    if (insertError && /sort_order/i.test(insertError.message)) {
      ;({ error: insertError } = await admin
        .from("tb_sku_recipe")
        .insert(values.map(({ sort_order: _, ...v }) => v)))
    }
    if (insertError) return { error: insertError.message }
  }

  revalidatePath("/dashboard/production-write")
  revalidatePath("/dashboard/data-table/tb_sku_recipe")
  return { success: true }
}
