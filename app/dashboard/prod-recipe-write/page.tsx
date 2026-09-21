import { createAdminClient } from "@/lib/supabase/admin"
import { getTables, getCategoryOptions } from "@/lib/supabase/db"
import {
  ProdRecipeForm,
  type InitialProdRecipe,
  type InitialRecipeHeader,
  type RawNutrition,
} from "@/components/prod-recipe-form"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import {
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  STORAGE_OPTIONS,
  STATUS_OPTIONS,
  UNIT_OPTIONS,
  TABLE_FIELD_ORDER,
} from "@/lib/table-config"

export default async function ProdRecipeWritePage() {
  const admin = createAdminClient()
  // 원재료·생산품은 둘 다 카테고리 유형 "RAW"를 쓴다 (판매품은 "SKU"로 별도)
  const categoryOptions = await getCategoryOptions("RAW").catch(() => [])

  const [prodRes, rawRes, recipeRes] = await Promise.all([
    admin.from("tb_prod_mst").select("id,prod_code,prod_name,unit").order("prod_code"),
    admin
      .from("tb_raw_mst")
      .select(
        "id,raw_code,raw_name,usage_unit,avg_weight,kcal_100g,carb_100g,protein_100g,fat_100g,kcal_ea,carb_ea,protein_ea,fat_ea",
      )
      .order("raw_code"),
    // 활성 버전(is_active=true)만 — tb_prod_recipe_h(헤더)+tb_prod_recipe_i(투입 라인, created_at 순).
    // 투입 라인은 sort_order 없이 created_at을 표시 순서로 쓴다(설계서 결정).
    admin
      .from("tb_prod_recipe_h")
      .select(
        "recipe_h_id,prod_id,std_batch_qty,yield_rate,std_labor_min,tb_prod_recipe_i(input_type,raw_id,prod_id,input_qty,input_unit,memo,created_at)",
      )
      .eq("is_active", true)
      .order("created_at", { referencedTable: "tb_prod_recipe_i", ascending: true }),
  ])

  const prodOptions = (prodRes.data ?? []).map((r) => ({
    value: r.id as string,
    label: [r.prod_code, r.prod_name].filter(Boolean).join(" · "),
  }))

  const rawOptions = (rawRes.data ?? []).map((r) => ({
    value: r.id as string,
    label: [r.raw_code, r.raw_name].filter(Boolean).join(" · "),
  }))

  // 원자재에 등록된 사용 단위 — 레시피 행에서 원자재 선택 시 단위 자동 입력용
  const rawUnitById = Object.fromEntries(
    (rawRes.data ?? []).filter((r) => r.usage_unit).map((r) => [r.id as string, String(r.usage_unit)]),
  ) as Record<string, string>

  // 생산품에 등록된 단위 — 레시피 행에서 다른 생산품을 재료로 선택할 때 단위 자동 입력용
  const prodUnitById = Object.fromEntries(
    (prodRes.data ?? []).filter((r) => r.unit).map((r) => [r.id as string, String(r.unit)]),
  ) as Record<string, string>

  // 원자재 영양성분 — 폼에서 투입량 기준 합계 자동 계산에 사용
  // (g/ml 단위: 100g당 기준, ea 단위: 개당 기준)
  const rawNutritionById = Object.fromEntries(
    (rawRes.data ?? []).map((r) => [
      r.id as string,
      {
        kcal: (r.kcal_100g as number | null) ?? null,
        carb: (r.carb_100g as number | null) ?? null,
        protein: (r.protein_100g as number | null) ?? null,
        fat: (r.fat_100g as number | null) ?? null,
        kcalEa: (r.kcal_ea as number | null) ?? null,
        carbEa: (r.carb_ea as number | null) ?? null,
        proteinEa: (r.protein_ea as number | null) ?? null,
        fatEa: (r.fat_ea as number | null) ?? null,
      },
    ]),
  ) as Record<string, RawNutrition>

  // ea 단위 원재료의 개당 평균 무게(g) — avg_weight 정본은 tb_raw_mst 단일
  const rawAvgWeightById = Object.fromEntries(
    (rawRes.data ?? []).map((r) => [r.id as string, (r.avg_weight as number | null) ?? null]),
  ) as Record<string, number | null>

  type RecipeIRow = { input_type: string; raw_id: string | null; prod_id: string | null; input_qty: number; input_unit: string; memo: string | null }
  type RecipeHRow = { recipe_h_id: string; prod_id: string; std_batch_qty: number | null; yield_rate: number | null; std_labor_min: number | null; tb_prod_recipe_i: RecipeIRow[] }
  const recipeHeaders = (recipeRes.data ?? []) as unknown as RecipeHRow[]

  const initialRecipes: InitialProdRecipe[] = recipeHeaders.flatMap((h) =>
    h.tb_prod_recipe_i.map((line) => ({
      prod_id: h.prod_id,
      raw_id: line.input_type === "RAW" ? line.raw_id : null,
      ingredient_prod_id: line.input_type === "PROD" ? line.prod_id : null,
      amount: line.input_qty,
      unit: line.input_unit,
      memo: line.memo,
    })),
  )

  const initialHeaders: Record<string, InitialRecipeHeader> = Object.fromEntries(
    recipeHeaders.map((h) => [
      h.prod_id,
      { stdBatchQty: h.std_batch_qty, yieldRate: h.yield_rate, stdLaborMin: h.std_labor_min },
    ]),
  )

  // 생산품/원재료 등록 다이얼로그용 컬럼 정의 (데이터 테이블의 등록 폼과 동일 구성)
  let prodInsertColumns: ColumnDef[] = []
  let rawInsertColumns: ColumnDef[] = []
  try {
    const tables = await getTables()
    const prodHidden = TABLE_HIDDEN_COLS["tb_prod_mst"] ?? new Set<string>()
    prodInsertColumns = (tables.find((t) => t.name === "tb_prod_mst")?.columns ?? []).filter(
      (c) => !HIDDEN_COLS.has(c.name) && !prodHidden.has(c.name),
    )
    const rawHidden = TABLE_HIDDEN_COLS["tb_raw_mst"] ?? new Set<string>()
    rawInsertColumns = (tables.find((t) => t.name === "tb_raw_mst")?.columns ?? []).filter(
      (c) => !HIDDEN_COLS.has(c.name) && !rawHidden.has(c.name),
    )
  } catch {}

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">생산품 레시피 작성</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            생산품별 원재료 구성을 등록하고 영양성분 합계를 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rawInsertColumns.length > 0 && (
            <AddRowDialog
              tableName="tb_raw_mst"
              columns={rawInsertColumns}
              columnOptions={{
                category_code: categoryOptions,
                storage: STORAGE_OPTIONS,
              }}
              fieldOrder={TABLE_FIELD_ORDER["tb_raw_mst"]}
              buttonLabel="원재료 등록"
              dialogTitle="원재료 등록"
            />
          )}
          {prodInsertColumns.length > 0 && (
            <AddRowDialog
              tableName="tb_prod_mst"
              columns={prodInsertColumns}
              columnOptions={{
                category_code: categoryOptions,
                storage_type: STORAGE_OPTIONS,
                prod_stage: STATUS_OPTIONS,
                unit: UNIT_OPTIONS,
              }}
              fieldOrder={TABLE_FIELD_ORDER["tb_prod_mst"]}
              buttonLabel="생산품 등록"
              dialogTitle="생산품 등록"
            />
          )}
        </div>
      </div>

      <ProdRecipeForm
        prodOptions={prodOptions}
        rawOptions={rawOptions}
        rawUnitById={rawUnitById}
        prodUnitById={prodUnitById}
        rawNutritionById={rawNutritionById}
        rawAvgWeightById={rawAvgWeightById}
        initialRecipes={initialRecipes}
        initialHeaders={initialHeaders}
      />
    </div>
  )
}
