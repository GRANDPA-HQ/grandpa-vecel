import { createAdminClient } from "@/lib/supabase/admin"
import { getTables } from "@/lib/supabase/db"
import {
  ProdRecipeForm,
  type InitialProdRecipe,
  type RawNutrition,
} from "@/components/prod-recipe-form"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import {
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  CATEGORY_OPTIONS,
  STORAGE_OPTIONS,
  STATUS_OPTIONS,
  UNIT_OPTIONS,
  TABLE_FIELD_ORDER,
} from "@/lib/table-config"

export default async function ProdRecipeWritePage() {
  const admin = createAdminClient()

  const [prodRes, rawRes] = await Promise.all([
    admin.from("tb_prod_mst").select("id,prod_code,prod_name").order("prod_code"),
    admin
      .from("tb_raw_mst")
      .select("id,raw_code,raw_name,kcal_100g,carb_100g,protein_100g,fat_100g")
      .order("raw_code"),
  ])

  // 드래그로 정한 행 순서(sort_order)대로 조회 — 컬럼이 아직 없는 DB에서는 기존 방식 폴백
  let recipeRes = await admin
    .from("tb_prod_recipe")
    .select("prod_id,raw_id,amount,unit,memo")
    .order("sort_order")
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

  // 원자재 100g 기준 영양성분 — 폼에서 투입량 기준 합계 자동 계산에 사용
  const rawNutritionById = Object.fromEntries(
    (rawRes.data ?? []).map((r) => [
      r.id as string,
      {
        kcal: (r.kcal_100g as number | null) ?? null,
        carb: (r.carb_100g as number | null) ?? null,
        protein: (r.protein_100g as number | null) ?? null,
        fat: (r.fat_100g as number | null) ?? null,
      },
    ]),
  ) as Record<string, RawNutrition>

  // 테이블이 아직 없으면(recipeRes.error) 빈 목록으로 시작 — 저장 시점에 에러가 표시된다
  const initialRecipes = (recipeRes.data ?? []) as InitialProdRecipe[]

  // 생산품 등록 다이얼로그용 컬럼 정의 (데이터 테이블의 등록 폼과 동일 구성)
  let prodInsertColumns: ColumnDef[] = []
  try {
    const tables = await getTables()
    const hidden = TABLE_HIDDEN_COLS["tb_prod_mst"] ?? new Set<string>()
    prodInsertColumns = (tables.find((t) => t.name === "tb_prod_mst")?.columns ?? []).filter(
      (c) => !HIDDEN_COLS.has(c.name) && !hidden.has(c.name),
    )
  } catch {}

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">생산품 레시피 작성</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            생산품별 원자재 구성을 등록하고 영양성분 합계를 확인합니다.
          </p>
        </div>
        {prodInsertColumns.length > 0 && (
          <AddRowDialog
            tableName="tb_prod_mst"
            columns={prodInsertColumns}
            columnOptions={{
              category_code: CATEGORY_OPTIONS,
              storage: STORAGE_OPTIONS,
              status: STATUS_OPTIONS,
              unit: UNIT_OPTIONS,
            }}
            fieldOrder={TABLE_FIELD_ORDER["tb_prod_mst"]}
            buttonLabel="생산품 등록"
            dialogTitle="생산품 등록"
          />
        )}
      </div>

      <ProdRecipeForm
        prodOptions={prodOptions}
        rawOptions={rawOptions}
        rawNutritionById={rawNutritionById}
        initialRecipes={initialRecipes}
      />
    </div>
  )
}
