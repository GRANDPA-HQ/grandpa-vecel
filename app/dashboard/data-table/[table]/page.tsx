import { getTables, getTableRows, getCategoryIdMap, getSkuOptions, getProdOptions } from "@/lib/supabase/db"
import { DataTable } from "@/components/data-table"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import {
  PAGE_SIZE,
  TABLE_PK,
  TABLE_DEFAULT_SORT,
  TABLE_SEARCH_COLUMNS,
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  TABLE_COLUMN_ORDER,
  ALLERGEN_OPTIONS,
} from "@/lib/table-config"

type SelectOption = { value: string; label: string }

const INSERTABLE_TABLES = new Set(["tb_prod_mst", "tb_raw_mst", "tb_sku_mst", "tb_sku_recipe"])

// 체크박스 선택 일괄 삭제를 지원하는 테이블
const BULK_DELETE_TABLES = new Set(["tb_raw_mst", "tb_prod_mst", "tb_sku_mst"])

// 카테고리 드롭박스를 사용할 테이블
const CATEGORY_TABLES = new Set(["tb_prod_mst", "tb_raw_mst", "tb_sku_mst"])

// 테이블별 등록 폼 입력 순서 (지정 안 한 나머지 컬럼은 기존 순서 그대로 뒤에 붙음)
const TABLE_FIELD_ORDER: Record<string, string[]> = {
  tb_sku_mst:  ["category_code", "sku_code"],
  tb_raw_mst:  ["category_code", "raw_code"],
  tb_prod_mst: ["category_code", "prod_code"],
}

// 테이블별 검색창 placeholder (지정 없으면 검색 대상 컬럼명을 그대로 사용)
const TABLE_SEARCH_PLACEHOLDER: Record<string, string> = {
  tb_sku_recipe: "SKU/생산품 코드·이름, 메모 검색",
}

const CATEGORY_OPTIONS: SelectOption[] = [
  "VFR","COND","BWL","BEV","MTS","HRS","FLR","SDW","ETC","SDS","NUT","DAI","YGF","SOUP","GC",
].map((c) => ({ value: c, label: c }))

const STORAGE_OPTIONS: SelectOption[] = ["냉장", "냉동", "상온"].map((v) => ({ value: v, label: v }))
const STORAGE_TABLES = new Set(["tb_prod_mst", "tb_raw_mst"])

const STATUS_OPTIONS: SelectOption[] = ["SEMI", "PREP", "COOK", "UNPROC"].map((v) => ({ value: v, label: v }))
const STATUS_TABLES = new Set(["tb_prod_mst"])

const UNIT_OPTIONS: SelectOption[] = ["g", "ml", "EA"].map((v) => ({ value: v, label: v }))
const UNIT_TABLES = new Set(["tb_prod_mst"])

type MultiOption = string | SelectOption

const SKU_MULTI_OPTIONS: Record<string, MultiOption[]> = {
  concept_tags:   ["Daily Balance", "Light & Clean", "Protein Care", "Digestive Comfort", "Recovery Food"],
  meal_time_tags: ["Breakfast", "Lunch", "Dinner"],
  diet_tags:      ["Vegan", "Vegetarian", "Lacto-Ovo"],
  nutrition_tags: ["Gluten-Free", "Low-Carb", "No Sugar", "Low-Sodium", "High-Protein", "Dairy-Free", "Caffeine-Free"],
  allergen_tags:  ALLERGEN_OPTIONS,
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>
  searchParams: Promise<{ sort?: string; dir?: string; q?: string }>
}) {
  const { table } = await params
  const tableName = decodeURIComponent(table)
  const { sort, dir, q } = await searchParams

  const defaultSort = TABLE_DEFAULT_SORT[tableName]
  const sortColumn = sort || defaultSort?.column
  const sortDir: "asc" | "desc" = dir === "desc" ? "desc" : dir === "asc" ? "asc" : defaultSort?.dir ?? "asc"
  const searchColumns = TABLE_SEARCH_COLUMNS[tableName] ?? []
  const searchQuery = q?.trim() ?? ""
  const searchEnabled = searchColumns.length > 0

  let columns: string[] = []
  let pkColumn: string | null = null
  let insertColumns: ColumnDef[] = []
  const tableHidden = TABLE_HIDDEN_COLS[tableName] ?? new Set<string>()
  const isHidden = (c: string) => HIDDEN_COLS.has(c) || tableHidden.has(c)
  try {
    const tables = await getTables()
    const match = tables.find((t) => t.name === tableName)
    const allColumns = match?.columns.map((c) => c.name) ?? []
    pkColumn = TABLE_PK[tableName] ?? (allColumns.includes("id") ? "id" : null)
    columns = allColumns.filter((c) => !isHidden(c))
    insertColumns = (match?.columns ?? []).filter((c) => !isHidden(c.name))
  } catch {
    // fall back to columns derived from rows below
  }

  // tb_sku_recipe: sku_id / prod_id 드롭박스 + UUID → 이름 resolver (검색에도 사용하므로 행 조회보다 먼저 준비)
  const columnOptions: Record<string, SelectOption[]> = {}
  const columnResolvers: Record<string, Record<string, string>> = {}
  let recipeIdFilter: { column: string; ids: string[] }[] | undefined

  if (tableName === "tb_sku_recipe") {
    const [skuOpts, prodOpts] = await Promise.all([
      getSkuOptions().catch(() => [] as SelectOption[]),
      getProdOptions().catch(() => [] as SelectOption[]),
    ])
    columnOptions["sku_id"]  = skuOpts
    columnOptions["prod_id"] = prodOpts
    columnOptions["unit"]    = [
      { value: "g",  label: "g"  },
      { value: "ml", label: "ml" },
      { value: "ea", label: "ea" },
    ]
    columnResolvers["sku_id"]  = Object.fromEntries(skuOpts.map((o) => [o.value, o.label]))
    columnResolvers["prod_id"] = Object.fromEntries(prodOpts.map((o) => [o.value, o.label]))

    if (searchQuery) {
      // 띄어쓰기 무시 비교 (예: "요거트랜치" ↔ "요거트 랜치")
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase()
      const q = norm(searchQuery)
      recipeIdFilter = [
        { column: "sku_id",  ids: skuOpts.filter((o) => norm(o.label).includes(q)).map((o) => o.value) },
        { column: "prod_id", ids: prodOpts.filter((o) => norm(o.label).includes(q)).map((o) => o.value) },
      ]
    }
  }

  let rows: Record<string, unknown>[] = []
  let total: number | null = null
  let nextCursor = null as Awaited<ReturnType<typeof getTableRows>>["nextCursor"]
  let error: string | null = null
  try {
    const result = await getTableRows(tableName, PAGE_SIZE, 0, {
      orderBy: sortColumn,
      orderDir: sortDir,
      pkColumn: pkColumn ?? undefined,
      search: searchEnabled && searchQuery
        ? { columns: searchColumns, query: searchQuery, idInColumns: recipeIdFilter }
        : undefined,
    })
    rows = result.rows
    total = result.total
    nextCursor = result.nextCursor
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load rows"
  }

  if (columns.length === 0 && rows.length > 0) {
    const allColumns = Object.keys(rows[0])
    if (!pkColumn && allColumns.includes("id")) pkColumn = "id"
    columns = allColumns.filter((c) => !isHidden(c))
  }

  const columnOrder = TABLE_COLUMN_ORDER[tableName]
  if (columnOrder) {
    columns = [
      ...columnOrder.filter((c) => columns.includes(c)),
      ...columns.filter((c) => !columnOrder.includes(c)),
    ]
  }

  const canInsert = INSERTABLE_TABLES.has(tableName)

  // 드롭박스 옵션 (category_code, status, storage 등)
  if (CATEGORY_TABLES.has(tableName)) {
    columnOptions["category_code"] = CATEGORY_OPTIONS
  }
  if (STORAGE_TABLES.has(tableName)) {
    columnOptions["storage"] = STORAGE_OPTIONS
  }
  if (STATUS_TABLES.has(tableName)) {
    columnOptions["status"] = STATUS_OPTIONS
  }
  if (UNIT_TABLES.has(tableName)) {
    columnOptions["unit"] = UNIT_OPTIONS
  }
  if (tableName === "tb_sku_mst") {
    // allergen_tags는 ENUM 값(MILK 등)으로 저장되므로 표시 시 한글명으로 변환
    columnResolvers["allergen_tags"] = Object.fromEntries(ALLERGEN_OPTIONS.map((o) => [o.value, o.label]))
  }

  // FK 컬럼 → 사람이 읽을 수 있는 값으로 변환 (catgegory_id → category_code)
  // tb_sku_mst는 category_code 직접 컬럼으로 변경되어 resolver 불필요
  if (CATEGORY_TABLES.has(tableName) && tableName !== "tb_sku_mst") {
    try {
      columnResolvers["catgegory_id"] = await getCategoryIdMap()
    } catch {}
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{tableName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total !== null ? `${total} ${total === 1 ? "row" : "rows"}` : "Showing rows"}
            {" · "}
            {columns.length} columns
          </p>
        </div>
        {canInsert && (
          <AddRowDialog
            tableName={tableName}
            columns={insertColumns}
            columnOptions={columnOptions}
            columnMultiOptions={tableName === "tb_sku_mst" ? SKU_MULTI_OPTIONS : undefined}
            fieldOrder={TABLE_FIELD_ORDER[tableName]}
          />
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <DataTable
          key={`${sortColumn ?? ""}-${sortDir}-${searchQuery}`}
          columns={columns}
          rows={rows}
          total={total}
          nextCursor={nextCursor}
          tableName={tableName}
          pkColumn={pkColumn}
          columnOptions={columnOptions}
          columnResolvers={columnResolvers}
          columnMultiOptions={tableName === "tb_sku_mst" ? SKU_MULTI_OPTIONS : undefined}
          sortColumn={sortColumn}
          sortDir={sortDir}
          searchQuery={searchQuery}
          searchEnabled={searchEnabled}
          searchPlaceholder={searchEnabled ? TABLE_SEARCH_PLACEHOLDER[tableName] ?? `${searchColumns.join(", ")} 검색` : undefined}
          bulkDeleteEnabled={BULK_DELETE_TABLES.has(tableName)}
        />
      )}
    </div>
  )
}
