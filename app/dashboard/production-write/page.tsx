import { createAdminClient } from "@/lib/supabase/admin"
import { SkuRecipeForm, type InitialRecipe } from "@/components/sku-recipe-form"

export default async function ProductionWritePage() {
  const admin = createAdminClient()

  const [skuRes, prodRes, recipeRes] = await Promise.all([
    admin.from("tb_sku_mst").select("id,sku_code,sku_name").order("sku_code"),
    admin.from("tb_prod_mst").select("id,prod_code,prod_name").order("prod_code"),
    admin.from("tb_sku_recipe").select("sku_id,prod_id,amount,unit,memo"),
  ])

  const skuOptions = (skuRes.data ?? []).map((r) => ({
    value: r.id as string,
    label: [r.sku_code, r.sku_name].filter(Boolean).join(" · "),
  }))

  const prodOptions = (prodRes.data ?? []).map((r) => ({
    value: r.id as string,
    label: [r.prod_code, r.prod_name].filter(Boolean).join(" · "),
  }))

  const initialRecipes = (recipeRes.data ?? []) as InitialRecipe[]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">판매품 레시피 작성</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          SKU별 생산품 구성을 등록하고 편집합니다.
        </p>
      </div>

      <SkuRecipeForm
        skuOptions={skuOptions}
        prodOptions={prodOptions}
        initialRecipes={initialRecipes}
      />
    </div>
  )
}
