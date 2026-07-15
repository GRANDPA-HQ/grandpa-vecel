import { createAdminClient } from "@/lib/supabase/admin"
import { getTables } from "@/lib/supabase/db"
import { SkuRecipeForm, type InitialRecipe } from "@/components/sku-recipe-form"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import {
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  CATEGORY_OPTIONS,
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

  const [skuRes, prodRes] = await Promise.all([
    admin.from("tb_sku_mst").select("id,sku_code,sku_name").order("sku_code"),
    admin.from("tb_prod_mst").select("id,prod_code,prod_name,status").order("prod_code"),
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

  // SKU 레시피에는 PREP / COOK 상태의 생산품만 사용 가능
  const prodOptions = allProds
    .filter((r) => r.status === "PREP" || r.status === "COOK")
    .map((r) => ({
      value: r.id as string,
      label: [r.prod_code, r.prod_name].filter(Boolean).join(" · "),
    }))

  // 기존 레시피가 참조 중인 필터 밖 생산품(SEMI 등)의 라벨 표시용 전체 맵
  const prodLabelById = Object.fromEntries(
    allProds.map((r) => [
      r.id as string,
      [r.prod_code, r.prod_name].filter(Boolean).join(" · ") + (r.status ? ` [${r.status}]` : ""),
    ]),
  ) as Record<string, string>

  const initialRecipes = (recipeRes.data ?? []) as InitialRecipe[]

  // ?sku=<sku_code> 짧은 URL로 진입하면 해당 SKU 탭이 선택된 상태로 시작
  const initialSkuId = sku
    ? ((skuRes.data ?? []).find((r) => r.sku_code === sku)?.id as string | undefined)
    : undefined

  // 판매품 등록 다이얼로그용 컬럼 정의 (데이터 테이블의 등록 폼과 동일 구성)
  let skuInsertColumns: ColumnDef[] = []
  try {
    const tables = await getTables()
    const hidden = TABLE_HIDDEN_COLS["tb_sku_mst"] ?? new Set<string>()
    skuInsertColumns = (tables.find((t) => t.name === "tb_sku_mst")?.columns ?? []).filter(
      (c) => !HIDDEN_COLS.has(c.name) && !hidden.has(c.name),
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

      <SkuRecipeForm
        skuOptions={skuOptions}
        prodOptions={prodOptions}
        prodLabelById={prodLabelById}
        initialRecipes={initialRecipes}
        initialSkuId={initialSkuId}
      />
    </div>
  )
}
