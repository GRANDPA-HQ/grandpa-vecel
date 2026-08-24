import type { ReactNode } from "react"
import {
  getTables,
  getTableRows,
  getCategoryIdMap,
  getSkuOptions,
  getProdOptions,
  getRawOptions,
  getIdLabelOptions,
  getZoneTypeOptions,
  getZoneOptions,
  getSubmatZoneLinks,
  getStoreScopeOptions,
  getColumnPrefs,
  getCategoryOptions,
  getSubmatCategoryOptions,
  type SubmatZoneLink,
} from "@/lib/supabase/db"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentEmployee } from "@/lib/permissions"
import { DataTable } from "@/components/data-table"
import { AddRowDialog, type ColumnDef } from "@/components/add-row-dialog"
import { SubmatZoneCell } from "@/components/submat-zone-cell"
import {
  PAGE_SIZE,
  TABLE_PK,
  TABLE_DEFAULT_SORT,
  TABLE_SEARCH_COLUMNS,
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  TABLE_COLUMN_ORDER,
  TABLE_TRAILING_COLS,
  ALLERGEN_OPTIONS,
  EMPLOYEE_FK_LOOKUPS,
  ZONE_FK_LOOKUPS,
  ASSET_FK_LOOKUPS,
  ASSET_GROUP_OPTIONS,
  sortOptionsByLabelOrder,
  STORAGE_OPTIONS,
  STATUS_OPTIONS,
  UNIT_OPTIONS,
  ACTIVE_OPTIONS,
  SKU_MULTI_OPTIONS,
  TABLE_FIELD_ORDER,
  SOP_CATEGORY_OPTIONS,
  SOP_STATUS_OPTIONS,
  SOP_TARGET_TYPE_OPTIONS,
  type SelectOption,
} from "@/lib/table-config"

const INSERTABLE_TABLES = new Set(["tb_prod_mst", "tb_raw_mst", "tb_sku_mst", "tb_sku_recipe", "tb_prod_recipe", "tb_zone_mst"])

// 체크박스 선택 일괄 삭제를 지원하는 테이블
const BULK_DELETE_TABLES = new Set(["tb_raw_mst", "tb_prod_mst", "tb_sku_mst"])

// 카테고리 드롭박스를 사용할 테이블
const CATEGORY_TABLES = new Set(["tb_prod_mst", "tb_raw_mst", "tb_sku_mst"])

// 테이블별 검색창 placeholder (지정 없으면 검색 대상 컬럼명을 그대로 사용)
const TABLE_SEARCH_PLACEHOLDER: Record<string, string> = {
  tb_sku_recipe:  "SKU/생산품 코드·이름, 메모 검색",
  tb_prod_recipe: "생산품/원재료 코드·이름, 메모 검색",
}

const STORAGE_TABLES = new Set(["tb_prod_mst", "tb_raw_mst"])
const STATUS_TABLES = new Set(["tb_prod_mst"])
const UNIT_TABLES = new Set(["tb_prod_mst"])
// active 컬럼(DB에서는 'active'/'inactive' ENUM)이 있는 테이블 — 자유 입력 대신 select로 제한
const ACTIVE_TABLES = new Set(["tb_prod_mst", "tb_raw_mst", "tb_category_mst"])

// 검색창 옆 카테고리 선택 필터 — 원재료/생산품/판매품/포장 부자재/시설 공통.
// 필터링에 쓸 컬럼명만 정의하고, 옵션 목록은 테이블별로 다른 소스에서 조회한다
// (원재료·생산품은 tb_category_mst "RAW" 유형, 판매품은 "SKU" 유형, 포장 부자재는
// tb_submat_category_mst, 시설은 tb_asset_type_mst를 FK로 참조).
const CATEGORY_FILTER_COLUMN: Record<string, string> = {
  tb_raw_mst: "category_code",
  tb_prod_mst: "category_code",
  tb_sku_mst: "category_code",
  tb_submat_mst: "category_code",
  tb_asset_mst: "asset_type_id",
  tb_sop_mst: "sop_category",
  tb_zone_mst: "zone_type_id",
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>
  searchParams: Promise<{ sort?: string; dir?: string; q?: string; category?: string; assetGroup?: string }>
}) {
  const { table } = await params
  const tableName = decodeURIComponent(table)
  const { sort, dir, q, category, assetGroup } = await searchParams
  const categoryValue = category?.trim() ?? ""
  const assetGroupValue = assetGroup?.trim() ?? ""

  const employee = await getCurrentEmployee()
  const storeScope = await getStoreScopeOptions(tableName, employee?.isSenior ?? false, employee?.storeId ?? null)

  const defaultSort = TABLE_DEFAULT_SORT[tableName]
  const sortColumn = sort || defaultSort?.column
  const sortDir: "asc" | "desc" = dir === "desc" ? "desc" : dir === "asc" ? "asc" : defaultSort?.dir ?? "asc"
  const searchColumns = TABLE_SEARCH_COLUMNS[tableName] ?? []
  const searchQuery = q?.trim() ?? ""
  const searchEnabled = searchColumns.length > 0
  const categoryFilterColumn = CATEGORY_FILTER_COLUMN[tableName]
  let categoryFilterOptions: SelectOption[] = []

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

  // tb_prod_recipe: prod_id / raw_id / ingredient_prod_id 드롭박스 + UUID → 이름 resolver
  // (생산품 레시피의 구성 재료는 원재료뿐 아니라 다른 생산품일 수도 있다 — 예: 요거트랜치믹스를
  // 만들어두고 그걸 재료로 요거트랜치드레싱을 만드는 경우)
  if (tableName === "tb_prod_recipe") {
    const [prodOpts, rawOpts] = await Promise.all([
      getProdOptions().catch(() => [] as SelectOption[]),
      getRawOptions().catch(() => [] as SelectOption[]),
    ])
    columnOptions["prod_id"] = prodOpts
    columnOptions["raw_id"]  = rawOpts
    columnOptions["ingredient_prod_id"] = prodOpts
    columnOptions["unit"]    = [
      { value: "g",  label: "g"  },
      { value: "ml", label: "ml" },
      { value: "ea", label: "ea" },
    ]
    columnResolvers["prod_id"] = Object.fromEntries(prodOpts.map((o) => [o.value, o.label]))
    columnResolvers["raw_id"]  = Object.fromEntries(rawOpts.map((o) => [o.value, o.label]))
    columnResolvers["ingredient_prod_id"] = Object.fromEntries(prodOpts.map((o) => [o.value, o.label]))

    if (searchQuery) {
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase()
      const q = norm(searchQuery)
      recipeIdFilter = [
        { column: "prod_id", ids: prodOpts.filter((o) => norm(o.label).includes(q)).map((o) => o.value) },
        { column: "raw_id",  ids: rawOpts.filter((o) => norm(o.label).includes(q)).map((o) => o.value) },
        { column: "ingredient_prod_id", ids: prodOpts.filter((o) => norm(o.label).includes(q)).map((o) => o.value) },
      ]
    }
  }

  // employees: 매장/파트/직책/직급 FK를 이름으로 표시하고 드롭다운으로 편집
  if (tableName === "employees") {
    const lookups = await Promise.all(
      EMPLOYEE_FK_LOOKUPS.map((l) =>
        getIdLabelOptions(l.table, l.labelColumn).catch(() => [] as SelectOption[]),
      ),
    )
    EMPLOYEE_FK_LOOKUPS.forEach((l, i) => {
      columnOptions[l.column] = sortOptionsByLabelOrder(lookups[i], l.labelOrder)
      columnResolvers[l.column] = Object.fromEntries(lookups[i].map((o) => [o.value, o.label]))
    })
  }

  // tb_zone_mst: 지점/구역유형 FK를 이름으로 표시
  if (tableName === "tb_zone_mst") {
    const lookups = await Promise.all(
      ZONE_FK_LOOKUPS.map((l) =>
        getIdLabelOptions(l.table, l.labelColumn, l.idColumn).catch(() => [] as SelectOption[]),
      ),
    )
    ZONE_FK_LOOKUPS.forEach((l, i) => {
      columnOptions[l.column] = lookups[i]
      columnResolvers[l.column] = Object.fromEntries(lookups[i].map((o) => [o.value, o.label]))
    })
    // 구역 유형(zone_type_id)이 곧 이 테이블의 "카테고리" 역할
    categoryFilterOptions = columnOptions["zone_type_id"] ?? []
  }

  // tb_sop_mst: ENUM 드롭박스 + 구역 유형 FK를 이름으로 표시
  if (tableName === "tb_sop_mst") {
    columnOptions["sop_category"] = SOP_CATEGORY_OPTIONS
    columnOptions["status"] = SOP_STATUS_OPTIONS
    columnOptions["target_type"] = SOP_TARGET_TYPE_OPTIONS
    categoryFilterOptions = SOP_CATEGORY_OPTIONS

    const zoneTypeLookup = ZONE_FK_LOOKUPS.find((l) => l.column === "zone_type_id")
    if (zoneTypeLookup) {
      const opts = await getIdLabelOptions(
        zoneTypeLookup.table,
        zoneTypeLookup.labelColumn,
        zoneTypeLookup.idColumn,
      ).catch(() => [] as SelectOption[])
      columnOptions["zone_type_id"] = opts
      columnResolvers["zone_type_id"] = Object.fromEntries(opts.map((o) => [o.value, o.label]))
    }
  }

  // tb_asset_mst: 시설 유형/구역 FK를 이름으로 표시
  let assetGroupFilterIds: string[] | null = null
  if (tableName === "tb_asset_mst") {
    const assetTypeLookup = ASSET_FK_LOOKUPS.find((l) => l.column === "asset_type_id")
    const [assetTypeOpts, zoneOpts, assetTypeGroups] = await Promise.all([
      assetTypeLookup
        ? getIdLabelOptions(assetTypeLookup.table, assetTypeLookup.labelColumn, assetTypeLookup.idColumn).catch(
            () => [] as SelectOption[],
          )
        : Promise.resolve([] as SelectOption[]),
      getZoneOptions().catch(() => [] as SelectOption[]),
      // asset_type_id → 상위 구분(EQ/FX/FC) — "장비/집기/시설" 필터에서 해당 구분의 자산유형
      // id 목록으로 변환해 asset_type_id에 in 필터로 적용하는 데 쓴다
      getIdLabelOptions("tb_asset_type_mst", "asset_type", "asset_type_id").catch(() => [] as SelectOption[]),
    ])
    columnOptions["asset_type_id"] = assetTypeOpts
    columnResolvers["asset_type_id"] = Object.fromEntries(assetTypeOpts.map((o) => [o.value, o.label]))
    columnOptions["zone_id"] = zoneOpts
    columnResolvers["zone_id"] = Object.fromEntries(zoneOpts.map((o) => [o.value, o.label]))
    // 시설 유형(asset_type_id)이 곧 이 테이블의 "카테고리" 역할
    categoryFilterOptions = assetTypeOpts
    if (assetGroupValue) {
      assetGroupFilterIds = assetTypeGroups.filter((g) => g.label === assetGroupValue).map((g) => g.value)
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
      ...storeScope,
      filters: [
        ...(storeScope.filters ?? []),
        ...(categoryFilterColumn && categoryValue ? [{ column: categoryFilterColumn, value: categoryValue }] : []),
      ],
      inFilters: [
        ...(storeScope.inFilters ?? []),
        ...(assetGroupFilterIds ? [{ column: "asset_type_id", values: assetGroupFilterIds }] : []),
      ],
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

  // 열 순서/숨김(계정별이 아닌 전체 공통 설정) — table_column_prefs가 아직 없으면(배포 초기)
  // 조용히 빈 값으로 폴백한다.
  const { hiddenColumns: savedHidden, columnOrder: savedOrder } = await getColumnPrefs(tableName).catch(
    () => ({ hiddenColumns: [] as string[], columnOrder: [] as string[] }),
  )

  if (savedOrder.length > 0) {
    // 사용자가 드래그로 저장한 순서가 있으면 개발자 기본 순서·고정 열(trailing) 배치보다 우선한다
    const savedValid = savedOrder.filter((c) => columns.includes(c))
    columns = [...savedValid, ...columns.filter((c) => !savedValid.includes(c))]
  } else {
    // 지정된 컬럼(예: photo_url)은 항상 맨 뒤로 보낸다
    const trailingCols = TABLE_TRAILING_COLS[tableName]
    if (trailingCols && trailingCols.length > 0) {
      columns = [
        ...columns.filter((c) => !trailingCols.includes(c)),
        ...trailingCols.filter((c) => columns.includes(c)),
      ]
    }
  }

  // 열 표시/숨김 — 토글 UI에는 숨긴 컬럼도 계속 보여줘야 하므로 필터링 전
  // 전체 목록을 toggleableColumns로 따로 보관해 둔다.
  const toggleableColumns = columns
  const hiddenColumns = savedHidden.filter((c) => toggleableColumns.includes(c))
  columns = columns.filter((c) => !hiddenColumns.includes(c))

  const canInsert = INSERTABLE_TABLES.has(tableName)

  // 드롭박스 옵션 (category_code, status, storage 등)
  // category_code는 카테고리 유형별로 중복될 수 있어(예: SDS가 원재료·생산품 분류와
  // 판매품 분류에 각각 존재) tb_sku_mst는 "SKU" 유형을, 나머지는 "RAW" 유형을 조회한다.
  if (CATEGORY_TABLES.has(tableName)) {
    const categoryType = tableName === "tb_sku_mst" ? "SKU" : "RAW"
    columnOptions["category_code"] = await getCategoryOptions(categoryType).catch(() => [] as SelectOption[])
    categoryFilterOptions = columnOptions["category_code"]
  }
  // tb_submat_mst: tb_category_mst와는 독립된 전용 카테고리 테이블을 쓴다
  if (tableName === "tb_submat_mst") {
    columnOptions["category_code"] = await getSubmatCategoryOptions().catch(() => [] as SelectOption[])
    categoryFilterOptions = columnOptions["category_code"]
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
  if (ACTIVE_TABLES.has(tableName)) {
    columnOptions["active"] = ACTIVE_OPTIONS
  }
  if (tableName === "tb_sku_mst") {
    // allergen_tags는 ENUM 값(MILK 등)으로 저장되므로 표시 시 한글명으로 변환
    columnResolvers["allergen_tags"] = Object.fromEntries(ALLERGEN_OPTIONS.map((o) => [o.value, o.label]))
  }

  // tb_sku_mst: 레시피(tb_sku_recipe)가 등록된 SKU에 레시피 작성 페이지로 가는 링크 표시
  // URL은 UUID 대신 sku_code를 사용해 짧게 유지 (/dashboard/production-write?sku=VFR_001)
  // insertBeforeIndex: 항상 맨 앞(체크박스 바로 다음)에 고정 — 예전엔 photo_url 컬럼 바로 앞에
  // 붙였는데, 직원이 "열 관리"에서 photo_url 위치를 옮기면 레시피도 같이 끌려가 포토 URL과
  // 붙어 보이는 문제가 있었다. photo_url은 열 관리 목록에 있어 순서를 옮길 수 있지만
  // 레시피는 실제 DB 컬럼이 아니라 열 관리로 관리할 수 없어, 아예 위치를 고정해 분리했다.
  let rowLinks: { header: string; hrefByPk: Record<string, string>; insertBeforeIndex?: number } | undefined
  if (tableName === "tb_sku_mst") {
    try {
      const admin = createAdminClient()
      const { data: recipeRows } = await admin.from("tb_sku_recipe").select("sku_id")
      const skuIds = Array.from(new Set((recipeRows ?? []).map((r) => r.sku_id as string).filter(Boolean)))
      if (skuIds.length > 0) {
        const { data: skus } = await admin.from("tb_sku_mst").select("id,sku_code").in("id", skuIds)
        rowLinks = {
          header: "레시피",
          hrefByPk: Object.fromEntries(
            (skus ?? [])
              .filter((s) => s.sku_code)
              .map((s) => [
                s.id as string,
                `/dashboard/production-write?sku=${encodeURIComponent(s.sku_code as string)}`,
              ]),
          ),
          insertBeforeIndex: 0,
        }
      }
    } catch {}
  }

  // tb_submat_mst: 부자재가 사용되는 Zone유형(tb_zone_type_mst)을 태그로 표시·편집.
  // 전사 공통 카탈로그 테이블이라 zone_id가 아닌 zone_type_id를 참조한다 (서대표 확정 v1.0 원칙).
  // ※ tb_submat_zone_link 테이블이 아직 없으면 조회가 빈 배열로 폴백되어 화면은 정상 렌더링된다.
  let extraColumn: { header: string; cellsByPk: Record<string, ReactNode> } | undefined
  if (tableName === "tb_submat_mst") {
    try {
      const [zoneOptions, links] = await Promise.all([
        getZoneTypeOptions().catch(() => [] as SelectOption[]),
        getSubmatZoneLinks().catch(() => [] as SubmatZoneLink[]),
      ])
      const linksBySubmat: Record<string, string[]> = {}
      for (const link of links) {
        ;(linksBySubmat[link.submat_id] ??= []).push(link.zone_type_id)
      }
      extraColumn = {
        header: "존",
        cellsByPk: Object.fromEntries(
          rows.map((row) => {
            const submatId = String(row["submat_id"] ?? "")
            return [
              submatId,
              (
                <SubmatZoneCell
                  key={submatId}
                  submatId={submatId}
                  initialZoneIds={linksBySubmat[submatId] ?? []}
                  zoneOptions={zoneOptions}
                />
              ),
            ]
          }),
        ),
      }
    } catch {}
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
          key={`${sortColumn ?? ""}-${sortDir}-${searchQuery}-${categoryValue}-${assetGroupValue}`}
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
          allColumns={toggleableColumns}
          hiddenColumns={hiddenColumns}
          rowLinks={rowLinks}
          extraColumn={extraColumn}
          categoryFilter={
            categoryFilterColumn && categoryFilterOptions.length > 0
              ? { column: categoryFilterColumn, options: categoryFilterOptions }
              : undefined
          }
          extraFilter={
            tableName === "tb_asset_mst"
              ? { paramName: "assetGroup", options: ASSET_GROUP_OPTIONS, placeholder: "전체 구분" }
              : undefined
          }
        />
      )}
    </div>
  )
}
