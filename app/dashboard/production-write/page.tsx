import { createAdminClient } from "@/lib/supabase/admin"
import { getTables } from "@/lib/supabase/db"
import { SkuRecipeForm, type InitialRecipe, type ProdNutrition } from "@/components/sku-recipe-form"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import {
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  CATEGORY_OPTIONS,
  STORAGE_OPTIONS,
  STATUS_OPTIONS,
  UNIT_OPTIONS,
  SKU_MULTI_OPTIONS,
  TABLE_FIELD_ORDER,
} from "@/lib/table-config"

export default async function ProductionWritePage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>
}) {
  const { sku } = await searchParams
  const admin = createAdminClient()

  const [skuRes, prodRes, prodRecipeRes, rawRes] = await Promise.all([
    admin.from("tb_sku_mst").select("id,sku_code,sku_name").order("sku_code"),
    admin.from("tb_prod_mst").select("id,prod_code,prod_name,status,unit").order("prod_code"),
    // 생산품별 원재료 구성 — 생산품 100g당 영양성분 계산용
    admin.from("tb_prod_recipe").select("prod_id,raw_id,amount,unit"),
    admin.from("tb_raw_mst").select("id,kcal_100g,carb_100g,protein_100g,fat_100g"),
  ])

  // 드래그로 정한 행 순서(sort_order)대로 조회 — 컬럼이 아직 없는 DB에서는 기존 방식 폴백
  let recipeRes = await admin
    .from("tb_sku_recipe")
    .select("sku_id,prod_id,amount,unit,memo")
    .order("sort_order")
  if (recipeRes.error) {
    recipeRes = await admin.from("tb_sku_recipe").select("sku_id,prod_id,amount,unit,memo")
  }

  const skuOptions = (skuRes.data ?? []).map((r) => ({
    value: r.id as string,
    label: [r.sku_code, r.sku_name].filter(Boolean).join(" · "),
  }))

  const allProds = prodRes.data ?? []

  // SKU 레시피에는 PREP / COOK / UNPROC 상태의 생산품만 사용 가능
  // (UNPROC은 무가공 원물로, SKU→PROD→RAW 알레르기 체인의 참조 노드 전용이라
  // 판매품 레시피에 직접 들어갈 수 있어야 한다 — SEMI는 계속 제외)
  const prodOptions = allProds
    .filter((r) => r.status === "PREP" || r.status === "COOK" || r.status === "UNPROC")
    .map((r) => ({
      value: r.id as string,
      label: [r.prod_code, r.prod_name].filter(Boolean).join(" · "),
    }))

  // 생산품에 등록된 단위 — 레시피 행에서 생산품 선택 시 단위 자동 입력용
  const prodUnitById = Object.fromEntries(
    allProds.filter((r) => r.unit).map((r) => [r.id as string, String(r.unit)]),
  ) as Record<string, string>

  // 기존 레시피가 참조 중인 필터 밖 생산품(SEMI 등)의 라벨 표시용 전체 맵
  const prodLabelById = Object.fromEntries(
    allProds.map((r) => [
      r.id as string,
      [r.prod_code, r.prod_name].filter(Boolean).join(" · ") + (r.status ? ` [${r.status}]` : ""),
    ]),
  ) as Record<string, string>

  const initialRecipes = (recipeRes.data ?? []) as InitialRecipe[]

  // 생산품 100g당 영양성분 — 생산품 레시피의 원재료 영양정보(100g 기준) × 투입량으로 계산.
  // ea 단위 원재료는 중량을 알 수 없어 제외하며, 프로덕트 레시피 합계 방식과 동일한 근사(ml≈1g)를 쓴다.
  const rawNutritionMap = new Map(
    (rawRes.data ?? []).map((r) => [
      r.id as string,
      {
        kcal: (r.kcal_100g as number | null) ?? null,
        carb: (r.carb_100g as number | null) ?? null,
        protein: (r.protein_100g as number | null) ?? null,
        fat: (r.fat_100g as number | null) ?? null,
      },
    ]),
  )
  const acc: Record<
    string,
    { grams: number; kcal: number; carb: number; protein: number; fat: number; hasData: boolean }
  > = {}
  for (const r of prodRecipeRes.data ?? []) {
    const prodId = r.prod_id as string | null
    const amount = Number(r.amount)
    const unit = String(r.unit ?? "").toLowerCase()
    if (!prodId || !r.raw_id || !Number.isFinite(amount) || amount <= 0 || unit === "ea") continue
    const a = (acc[prodId] ??= { grams: 0, kcal: 0, carb: 0, protein: 0, fat: 0, hasData: false })
    a.grams += amount
    const n = rawNutritionMap.get(r.raw_id as string)
    if (!n || (n.kcal === null && n.carb === null && n.protein === null && n.fat === null)) continue
    const factor = amount / 100
    a.kcal += (n.kcal ?? 0) * factor
    a.carb += (n.carb ?? 0) * factor
    a.protein += (n.protein ?? 0) * factor
    a.fat += (n.fat ?? 0) * factor
    a.hasData = true
  }
  const prodNutritionById = Object.fromEntries(
    Object.entries(acc)
      .filter(([, a]) => a.hasData && a.grams > 0)
      .map(([id, a]) => [
        id,
        {
          kcal: (a.kcal / a.grams) * 100,
          carb: (a.carb / a.grams) * 100,
          protein: (a.protein / a.grams) * 100,
          fat: (a.fat / a.grams) * 100,
        },
      ]),
  ) as Record<string, ProdNutrition>

  // ?sku=<sku_code> 짧은 URL로 진입하면 해당 SKU 탭이 선택된 상태로 시작
  const initialSkuId = sku
    ? ((skuRes.data ?? []).find((r) => r.sku_code === sku)?.id as string | undefined)
    : undefined

  // 판매품/생산품 등록 다이얼로그용 컬럼 정의 (데이터 테이블의 등록 폼과 동일 구성)
  let skuInsertColumns: ColumnDef[] = []
  let prodInsertColumns: ColumnDef[] = []
  try {
    const tables = await getTables()
    const skuHidden = TABLE_HIDDEN_COLS["tb_sku_mst"] ?? new Set<string>()
    skuInsertColumns = (tables.find((t) => t.name === "tb_sku_mst")?.columns ?? []).filter(
      (c) => !HIDDEN_COLS.has(c.name) && !skuHidden.has(c.name),
    )
    const prodHidden = TABLE_HIDDEN_COLS["tb_prod_mst"] ?? new Set<string>()
    prodInsertColumns = (tables.find((t) => t.name === "tb_prod_mst")?.columns ?? []).filter(
      (c) => !HIDDEN_COLS.has(c.name) && !prodHidden.has(c.name),
    )
  } catch {}

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">판매품 레시피 작성</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SKU별 생산품 구성을 등록하고 편집합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {skuInsertColumns.length > 0 && (
            <AddRowDialog
              tableName="tb_sku_mst"
              columns={skuInsertColumns}
              columnOptions={{ category_code: CATEGORY_OPTIONS }}
              columnMultiOptions={SKU_MULTI_OPTIONS}
              fieldOrder={TABLE_FIELD_ORDER["tb_sku_mst"]}
              buttonLabel="판매품 등록"
              dialogTitle="판매품 등록"
            />
          )}
        </div>
      </div>

      <SkuRecipeForm
        skuOptions={skuOptions}
        prodOptions={prodOptions}
        prodLabelById={prodLabelById}
        prodUnitById={prodUnitById}
        prodNutritionById={prodNutritionById}
        initialRecipes={initialRecipes}
        initialSkuId={initialSkuId}
      />
    </div>
  )
}
