import Link from "next/link"
import { getTables, getTableRows, getCategoryIdMap, getSkuOptions, getProdOptions } from "@/lib/supabase/db"
import { DataTable } from "@/components/data-table"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import { Button } from "@/components/ui/button"

type SelectOption = { value: string; label: string }

const PAGE_SIZE = 50
const HIDDEN_COLS = new Set(["id", "created_at", "updated_at"])
const INSERTABLE_TABLES = new Set(["tb_prod_mst", "tb_raw_mst", "tb_sku_mst", "tb_sku_recipe"])

// 테이블별 추가 숨김 컬럼
const TABLE_HIDDEN_COLS: Record<string, Set<string>> = {
  tb_prod_mst:   new Set(["active", "owner", "owner_part", "part", "yield_rate"]),
  tb_sku_mst:    new Set(["is_active"]),
  tb_sku_recipe: new Set(["input_id"]),
}

// 테이블별 PK 컬럼 (기본 "id" 외 추가)
const TABLE_PK: Record<string, string> = {
  tb_sku_recipe: "input_id",
}

// 카테고리 드롭박스를 사용할 테이블
const CATEGORY_TABLES = new Set(["tb_prod_mst", "tb_raw_mst", "tb_sku_mst"])

// 테이블별 등록 폼 입력 순서 (지정 안 한 나머지 컬럼은 기존 순서 그대로 뒤에 붙음)
const TABLE_FIELD_ORDER: Record<string, string[]> = {
  tb_sku_mst: ["category_code", "sku_code"],
}

// 테이블별 데이터 테이블 컬럼 표시 순서 (지정 안 한 나머지 컬럼은 기존 순서 그대로 뒤에 붙음)
const TABLE_COLUMN_ORDER: Record<string, string[]> = {
  tb_sku_mst: ["category_code", "sku_code", "sku_name", "sku_name_en"],
}

// 테이블별 기본 정렬 컬럼
const TABLE_DEFAULT_SORT: Record<string, { column: string; dir: "asc" | "desc" }> = {
  tb_sku_mst:      { column: "sku_code", dir: "asc" },
  tb_raw_mst:      { column: "raw_code", dir: "asc" },
  tb_prod_mst:     { column: "prod_code", dir: "asc" },
  tb_category_mst: { column: "category_code", dir: "asc" },
}

// 테이블별 검색 대상 컬럼 (코드/이름 등)
const TABLE_SEARCH_COLUMNS: Record<string, string[]> = {
  tb_sku_mst:      ["sku_code", "sku_name"],
  tb_raw_mst:      ["raw_code", "raw_name"],
  tb_prod_mst:     ["prod_code", "prod_name"],
  tb_category_mst: ["category_code", "category_name"],
  users:           ["email"],
}

const CATEGORY_OPTIONS: SelectOption[] = [
  "VFR","COND","BWL","BEV","MTS","HRS","FLR","SWD","ETC","SDS","NUT","DAI","YGF","SUP","GC",
].map((c) => ({ value: c, label: c }))

const STORAGE_OPTIONS: SelectOption[] = ["냉장", "냉동", "상온"].map((v) => ({ value: v, label: v }))
const STORAGE_TABLES = new Set(["tb_prod_mst", "tb_raw_mst"])

const SKU_MULTI_OPTIONS: Record<string, string[]> = {
  concept_tags:   ["Daily Balance", "Light & Clean", "Protein Care", "Digestive Comfort", "Recovery Food"],
  meal_time_tags: ["Breakfast", "Lunch", "Dinner"],
  diet_tags:      ["Vegan", "Vegetarian", "Lacto-Ovo"],
  nutrition_tags: ["Gluten-Free", "Low-Carb", "No Sugar", "Low-Sodium", "High-Protein", "Dairy-Free"],
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>
  searchParams: Promise<{ page?: string; sort?: string; dir?: string; q?: string }>
}) {
  const { table } = await params
  const tableName = decodeURIComponent(table)
  const { page, sort, dir, q } = await searchParams
  const currentPage = Math.max(1, Number.parseInt(page ?? "1", 10) || 1)
  const offset = (currentPage - 1) * PAGE_SIZE

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

  let rows: Record<string, unknown>[] = []
  let total: number | null = null
  let error: string | null = null
  try {
    const result = await getTableRows(tableName, PAGE_SIZE, offset, {
      orderBy: sortColumn,
      orderDir: sortDir,
      search: searchEnabled && searchQuery ? { columns: searchColumns, query: searchQuery } : undefined,
    })
    rows = result.rows
    total = result.total
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

  const totalPages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null
  const canInsert = INSERTABLE_TABLES.has(tableName)

  // 드롭박스 옵션 (category_code, status, storage 등)
  const columnOptions: Record<string, SelectOption[]> = {}
  if (CATEGORY_TABLES.has(tableName)) {
    columnOptions["category_code"] = CATEGORY_OPTIONS
  }
  if (STORAGE_TABLES.has(tableName)) {
    columnOptions["storage"] = STORAGE_OPTIONS
  }

  const columnResolvers: Record<string, Record<string, string>> = {}

  // tb_sku_recipe: sku_id / prod_id / unit 드롭박스 + UUID → 이름 resolver
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
  }

  // FK 컬럼 → 사람이 읽을 수 있는 값으로 변환 (catgegory_id → category_code)
  // tb_sku_mst는 category_code 직접 컬럼으로 변경되어 resolver 불필요
  if (CATEGORY_TABLES.has(tableName) && tableName !== "tb_sku_mst") {
    try {
      columnResolvers["catgegory_id"] = await getCategoryIdMap()
    } catch {}
  }

  const buildPageHref = (pageNum: number) => {
    const params = new URLSearchParams()
    params.set("page", String(pageNum))
    if (sort) params.set("sort", sort)
    if (dir) params.set("dir", dir)
    if (searchQuery) params.set("q", searchQuery)
    return `/dashboard/data-table/${encodeURIComponent(tableName)}?${params.toString()}`
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
        <>
          <DataTable
            key={`${currentPage}-${sortColumn ?? ""}-${sortDir}-${searchQuery}`}
            columns={columns}
            rows={rows}
            tableName={tableName}
            pkColumn={pkColumn}
            columnOptions={columnOptions}
            columnResolvers={columnResolvers}
            columnMultiOptions={tableName === "tb_sku_mst" ? SKU_MULTI_OPTIONS : undefined}
            sortColumn={sortColumn}
            sortDir={sortDir}
            searchQuery={searchQuery}
            searchEnabled={searchEnabled}
            searchPlaceholder={searchEnabled ? `${searchColumns.join(", ")} 검색` : undefined}
          />

          {totalPages !== null && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} asChild={currentPage > 1}>
                  {currentPage > 1 ? (
                    <Link href={buildPageHref(currentPage - 1)}>
                      Previous
                    </Link>
                  ) : (
                    <span>Previous</span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  asChild={currentPage < totalPages}
                >
                  {currentPage < totalPages ? (
                    <Link href={buildPageHref(currentPage + 1)}>
                      Next
                    </Link>
                  ) : (
                    <span>Next</span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
