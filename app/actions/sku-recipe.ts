"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type RecipeInput = {
  prodId: string
  amount: number
  unit: string
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
    const { error: insertError } = await admin.from("tb_sku_recipe").insert(
      rows.map((r) => ({
        sku_id: skuId,
        prod_id: r.prodId,
        amount: r.amount,
        unit: r.unit,
        memo: r.memo || null,
      })),
    )
    if (insertError) return { error: insertError.message }
  }

  revalidatePath("/dashboard/production-write")
  revalidatePath("/dashboard/data-table/tb_sku_recipe")
  return { success: true }
}
