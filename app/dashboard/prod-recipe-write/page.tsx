import { createAdminClient } from "@/lib/supabase/admin"
import { getTables, getCategoryOptions } from "@/lib/supabase/db"
import {
  ProdRecipeForm,
  type InitialProdRecipe,
  type RawNutrition,
} from "@/components/prod-recipe-form"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import {
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  STORAGE_OPTIONS,
  STATUS_OPTIONS,
  UNIT_OPTIONS,
  ACTIVE_OPTIONS,
  TABLE_FIELD_ORDER,
} from "@/lib/table-config"

export default async function ProdRecipeWritePage() {
  const admin = createAdminClient()
  // 원재료·생산품은 둘 다 카테고리 유형 "RAW"를 쓴다 (판매품은 "SKU"로 별도)
  const categoryOptions = await getCategoryOptions("RAW").catch(() => [])

  const [prodRes, rawRes] = await Promise.all([
    admin.from("tb_prod_mst").select("id,prod_code,prod_name,unit").order("prod_code"),
    admin
      .from("tb_raw_mst")
      .select(
        "id,raw_code,raw_name,usage_unit,kcal_100g,carb_100g,protein_100g,fat_100g,kcal_ea,carb_ea,protein_ea,fat_ea",
      )
      .order("raw_code"),
  ])

  // 드래그로 정한 행 순서(sort_order)·구성 재료가 생산품인 경우(ingredient_prod_id)까지
  // 함께 조회 — 아직 마이그레이션 전인 DB에서도 저장은 되도록 단계적으로 폴백한다
  // (폴백마다 select 컬럼 구성이 달라 엄격한 응답 타입 추론과 충돌하므로 any로 둔다)
  let recipeRes: any = await admin
    .from("tb_prod_recipe")
    .select("prod_id,raw_id,ingredient_prod_id,amount,unit,memo")
    .order("sort_order")
  if (recipeRes.error) {
    recipeRes = await admin
      .from("tb_prod_recipe")
      .select("prod_id,raw_id,ingredient_prod_id,amount,unit,memo")
  }
  if (recipeRes.error) {
    recipeRes = await admin
      .from("tb_prod_recipe")
      .select("prod_id,raw_id,amount,unit,memo")
      .order("sort_order")
  }
  if (recipeRes.error) {
    recipeRes = await admin.from("tb_prod_recipe").select("prod_id,raw_id,amount,unit,memo")
  }

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

  // 테이블이 아직 없으면(recipeRes.error) 빈 목록으로 시작 — 저장 시점에 에러가 표시된다
  // ingredient_prod_id 폴백 조회분은 해당 필드가 없으므로 null로 채워 형태를 맞춘다
  const initialRecipes = ((recipeRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...r,
    ingredient_prod_id: (r.ingredient_prod_id as string | null | undefined) ?? null,
  })) as InitialProdRecipe[]

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
                active: ACTIVE_OPTIONS,
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
                storage: STORAGE_OPTIONS,
                status: STATUS_OPTIONS,
                unit: UNIT_OPTIONS,
                active: ACTIVE_OPTIONS,
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
        initialRecipes={initialRecipes}
      />
    </div>
  )
}
