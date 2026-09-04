import "server-only"
import { updateTag } from "next/cache"
import { SUPABASE_URL } from "./config"
import {
  buildStoreScopeFilter,
  STORE_SCOPED_VIA_ZONE_TABLES,
  CACHEABLE_MASTER_TABLES,
  TABLE_DEFAULT_SORT,
  TABLE_PK,
  PAGE_SIZE,
  type RowCursor,
} from "@/lib/table-config"

// CACHEABLE_MASTER_TABLES에 속한 테이블의 캐시 태그 — 쓰기 시 updateTag로 이 태그만 즉시 무효화한다.
// (updateTag는 revalidateTag와 달리 Server Action 안에서 바로 최신 데이터를 읽게 해준다 — "read-your-own-writes")
const cacheTag = (table: string) => `table:${table}`
function revalidateTableCache(table: string) {
  if (CACHEABLE_MASTER_TABLES.has(table)) updateTag(cacheTag(table))
}

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

type ColumnInfo = {
  name: string
  type: string
  format: string
  required: boolean
}

export type TableInfo = {
  name: string
  columns: ColumnInfo[]
}

type OpenApiSpec = {
  definitions?: Record<
    string,
    {
      required?: string[]
      properties?: Record<string, { type?: string; format?: string; description?: string }>
    }
  >
}

function authHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  }
}

/**
 * Introspect the database by reading PostgREST's OpenAPI spec.
 * Returns the list of tables exposed on the public schema along with their columns.
 */
export async function getTables(): Promise<TableInfo[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      ...authHeaders(),
      Accept: "application/openapi+json",
    },
    // Schema rarely changes; cache briefly.
    next: { revalidate: 30 },
  })

  if (!res.ok) {
    throw new Error(`Failed to introspect database (${res.status})`)
  }

  const spec = (await res.json()) as OpenApiSpec
  const definitions = spec.definitions ?? {}

  return Object.entries(definitions)
    .map(([name, def]) => ({
      name,
      columns: Object.entries(def.properties ?? {}).map(([colName, col]) => ({
        name: colName,
        type: col.type ?? "unknown",
        format: col.format ?? "",
        required: (def.required ?? []).includes(colName),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export type TableRows = {
  rows: Record<string, unknown>[]
  total: number | null
  // 커서 페이지네이션: 다음 페이지 조회에 사용할 커서 (더 없으면 null)
  nextCursor: RowCursor | null
}

export type EqFilter = { column: string; value: string }
export type InFilter = { column: string; values: string[] }

export type TableRowsOptions = {
  orderBy?: string
  orderDir?: "asc" | "desc"
  // 커서 페이지네이션용 PK 컬럼 (정렬 tiebreaker 및 커서 기준)
  pkColumn?: string
  // 이 커서 이후의 행만 조회 (keyset pagination)
  cursor?: RowCursor
  search?: {
    columns: string[]
    query: string
    // FK 컬럼을 사람이 읽을 수 있는 값(예: sku_code)으로 검색할 때, 미리 매칭해 둔 id 목록으로 필터링
    idInColumns?: { column: string; ids: string[] }[]
  }
  // 검색어와 무관하게 항상 적용해야 하는 강제 필터 (예: 매장 스코핑)
  filters?: EqFilter[]
  // filters와 동일하되 "이 컬럼 값이 목록 중 하나" 조건 (예: 매장 소속 zone_id 목록)
  inFilters?: InFilter[]
}

// PostgREST 필터 값 인용: 백슬래시/따옴표 이스케이프 후 큰따옴표로 감싼다
function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/**
 * Fetch a page of rows from a table along with the exact total count.
 * `pkColumn`과 `cursor`를 주면 offset 대신 keyset(커서) 방식으로 다음 페이지를 조회한다.
 */
export async function getTableRows(
  table: string,
  limit = 50,
  offset = 0,
  options?: TableRowsOptions,
): Promise<TableRows> {
  let url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${limit}`
  if (offset > 0) url += `&offset=${offset}`

  for (const f of options?.filters ?? []) {
    url += `&${encodeURIComponent(f.column)}=eq.${encodeURIComponent(f.value)}`
  }
  for (const f of options?.inFilters ?? []) {
    // 빈 목록이면(예: 매장에 속한 zone이 하나도 없음) 절대 매칭되지 않는 값으로 안전하게 처리
    const value = f.values.length > 0 ? `in.(${f.values.join(",")})` : "eq.00000000-0000-0000-0000-000000000000"
    url += `&${encodeURIComponent(f.column)}=${encodeURIComponent(value)}`
  }

  const orderDir: "asc" | "desc" = options?.orderDir === "desc" ? "desc" : "asc"
  const pkColumn = options?.pkColumn
  const sortCol = options?.orderBy

  // 정렬: 커서가 행마다 유일하도록 PK를 tiebreaker로 항상 추가한다.
  // null 정렬 위치를 Postgres 기본값(asc=NULLS LAST, desc=NULLS FIRST)으로 고정해 커서 필터와 일치시킨다.
  const orderParts: string[] = []
  if (sortCol) orderParts.push(`${sortCol}.${orderDir}.${orderDir === "asc" ? "nullslast" : "nullsfirst"}`)
  if (pkColumn && pkColumn !== sortCol) orderParts.push(`${pkColumn}.asc`)
  if (orderParts.length > 0) {
    url += `&order=${encodeURIComponent(orderParts.join(","))}`
  }

  // 커서 이후 행만 조회하는 keyset 필터
  if (options?.cursor && pkColumn) {
    const pkAfter = `${pkColumn}.gt.${quoteFilterValue(options.cursor.pkValue)}`
    let clause: string
    if (sortCol && sortCol !== pkColumn) {
      const v = options.cursor.sortValue
      if (v === null) {
        clause =
          orderDir === "asc"
            ? // asc에서 null은 맨 뒤 → 남은 행은 같은 null 그룹에서 PK가 더 큰 행뿐
              `and(${sortCol}.is.null,${pkAfter})`
            : // desc에서 null은 맨 앞 → null 그룹의 나머지 + null이 아닌 모든 행
              `or(and(${sortCol}.is.null,${pkAfter}),${sortCol}.not.is.null)`
      } else {
        const qv = quoteFilterValue(v)
        clause =
          orderDir === "asc"
            ? `or(${sortCol}.gt.${qv},and(${sortCol}.eq.${qv},${pkAfter}),${sortCol}.is.null)`
            : `or(${sortCol}.lt.${qv},and(${sortCol}.eq.${qv},${pkAfter}))`
      }
    } else {
      clause = pkAfter
    }
    // 검색의 or= 파라미터와 AND로 결합되도록 별도 and= 파라미터로 전달
    url += `&and=${encodeURIComponent(`(${clause})`)}`
  }

  if (options?.search?.query.trim()) {
    const clauses: string[] = []
    // 띄어쓰기 무시 검색: 질의에서 공백을 제거하고, 글자 사이에 \s* 를 끼워
    // 저장값 쪽의 공백도 무시하고 매칭한다 (예: "요거트랜치" ↔ "요거트 랜치")
    const compact = options.search.query.replace(/\s+/g, "")
    if (compact) {
      const pattern = compact
        .split("")
        .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*")
      // PostgREST 따옴표 값 내부의 백슬래시/따옴표 이스케이프
      const quoted = pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      clauses.push(...options.search.columns.map((c) => `${c}.imatch."${quoted}"`))
    }
    for (const idCol of options.search.idInColumns ?? []) {
      if (idCol.ids.length > 0) clauses.push(`${idCol.column}.in.(${idCol.ids.join(",")})`)
    }
    if (clauses.length > 0) {
      url += `&or=${encodeURIComponent(`(${clauses.join(",")})`)}`
    }
  }

  // 매장 무관 마스터 테이블은 Next.js Data Cache에 태그를 걸어 캐싱한다 (쓰기 시 revalidateTag로 무효화).
  // URL 자체가 정렬/검색/필터 조합별로 달라지므로 조합마다 별도 캐시 항목이 되어 결과가 섞이지 않는다.
  const cacheOptions: RequestInit = CACHEABLE_MASTER_TABLES.has(table)
    ? { next: { revalidate: 300, tags: [cacheTag(table)] } }
    : { cache: "no-store" }

  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
      Prefer: "count=exact",
    },
    ...cacheOptions,
  })

  if (!res.ok) {
    throw new Error(`Failed to read "${table}" (${res.status})`)
  }

  const rows = (await res.json()) as Record<string, unknown>[]

  // Total comes back in the Content-Range header, e.g. "0-49/1234".
  const contentRange = res.headers.get("content-range")
  let total: number | null = null
  if (contentRange) {
    const parts = contentRange.split("/")
    const parsed = Number.parseInt(parts[1], 10)
    total = Number.isNaN(parsed) ? null : parsed
  }

  // 다음 페이지 커서: 마지막 행의 (정렬 컬럼 값, PK 값). 가득 차지 않았으면 더 없음.
  let nextCursor: RowCursor | null = null
  if (pkColumn && rows.length === limit) {
    const last = rows[rows.length - 1]
    const sv = sortCol && sortCol !== pkColumn ? last[sortCol] : null
    nextCursor = {
      sortValue: sv === null || sv === undefined ? null : String(sv),
      pkValue: String(last[pkColumn] ?? ""),
    }
  }

  return { rows, total, nextCursor }
}

/**
 * 로그인 직후 마스터 데이터 캐시를 미리 데워둔다 (app/actions/auth.ts에서 next/server의
 * after()로 응답을 막지 않고 백그라운드에서 호출). 데이터 테이블 화면이 처음 열 때 요청하는
 * 것과 동일한 조합(기본 정렬, 첫 페이지)으로 조회해야 같은 캐시 항목을 채울 수 있어
 * TABLE_DEFAULT_SORT/TABLE_PK를 페이지와 동일하게 그대로 사용한다.
 * 실패해도 로그인 자체엔 영향 없도록 각 테이블 조회를 개별적으로 무시한다.
 */
export async function warmMasterTableCaches(): Promise<void> {
  await Promise.all(
    Array.from(CACHEABLE_MASTER_TABLES).map((table) => {
      const defaultSort = TABLE_DEFAULT_SORT[table]
      return getTableRows(table, PAGE_SIZE, 0, {
        orderBy: defaultSort?.column,
        orderDir: defaultSort?.dir,
        pkColumn: TABLE_PK[table] ?? "id",
      }).catch(() => {})
    }),
  )
}

/**
 * 검색/정렬 조건에 매칭되는 모든 행을 조회한다 (엑셀 추출용).
 * Supabase의 요청당 최대 행 수 제한을 피해 1000행씩 나눠 받는다.
 */
export async function getAllTableRows(
  table: string,
  options?: Omit<TableRowsOptions, "cursor" | "pkColumn">,
): Promise<Record<string, unknown>[]> {
  const BATCH = 1000
  const MAX_ROWS = 100_000 // 안전 상한
  const all: Record<string, unknown>[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH) {
    const { rows } = await getTableRows(table, BATCH, offset, options)
    all.push(...rows)
    if (rows.length < BATCH) break
  }
  return all
}

/**
 * 감사 로그(tb_audit_log) 기록용 — 수정 전 특정 컬럼 값을 조회한다.
 * PATCH를 보내기 직전에 호출해 "이전 값"을 남겨야 나중에 되돌릴 수 있다.
 */
export async function getRowValue(
  table: string,
  pkColumn: string,
  pkValue: string,
  column: string,
): Promise<unknown> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(column)}&${encodeURIComponent(pkColumn)}=eq.${encodeURIComponent(pkValue)}`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return undefined
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0]?.[column]
}

/**
 * 감사 로그 기록용 — 삭제 전 행 전체를 조회한다. 삭제된 행을 되돌리려면(재삽입) 전체 값이 필요하다.
 */
export async function getRowsByPk(
  table: string,
  pkColumn: string,
  pkValues: string[],
): Promise<Record<string, unknown>[]> {
  if (pkValues.length === 0) return []
  const quoted = pkValues.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")
  const filter = `${encodeURIComponent(pkColumn)}=in.${encodeURIComponent(`(${quoted})`)}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&${filter}`, {
    headers: authHeaders(),
    cache: "no-store",
  })
  if (!res.ok) return []
  return (await res.json()) as Record<string, unknown>[]
}

/**
 * Update a single row in a table, identified by the given primary key column/value.
 */
export async function updateTableRow(
  table: string,
  pkColumn: string,
  pkValue: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const filter = `${encodeURIComponent(pkColumn)}=eq.${encodeURIComponent(pkValue)}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${filter}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(updates),
  })

  if (!res.ok) {
    let body = ""
    try {
      body = await res.text()
    } catch {}
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  revalidateTableCache(table)
}

/**
 * Delete a single row from a table, identified by the given primary key column/value.
 */
export async function deleteTableRow(
  table: string,
  pkColumn: string,
  pkValue: string,
): Promise<void> {
  const filter = `${encodeURIComponent(pkColumn)}=eq.${encodeURIComponent(pkValue)}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${filter}`, {
    method: "DELETE",
    headers: {
      ...authHeaders(),
      Prefer: "return=minimal",
    },
  })

  if (!res.ok) {
    let body = ""
    try {
      body = await res.text()
    } catch {}
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  revalidateTableCache(table)
}

/**
 * Delete multiple rows from a table in one request, identified by primary key values.
 */
export async function deleteTableRows(
  table: string,
  pkColumn: string,
  pkValues: string[],
): Promise<void> {
  if (pkValues.length === 0) return
  const quoted = pkValues.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")
  const filter = `${encodeURIComponent(pkColumn)}=in.${encodeURIComponent(`(${quoted})`)}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${filter}`, {
    method: "DELETE",
    headers: {
      ...authHeaders(),
      Prefer: "return=minimal",
    },
  })

  if (!res.ok) {
    let body = ""
    try {
      body = await res.text()
    } catch {}
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  revalidateTableCache(table)
}

// 테이블별 "열 숨김 / 열 순서" 설정 — 계정별이 아니라 전체 공통 설정이며,
// table_column_prefs 테이블에 저장돼 새로고침·재로그인 후에도 유지된다.
// 테이블이 아직 없으면(배포 초기) 조용히 빈 값으로 폴백한다.
export async function getColumnPrefs(
  tableName: string,
): Promise<{ hiddenColumns: string[]; columnOrder: string[] }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/table_column_prefs?select=hidden_columns,column_order&table_name=eq.${encodeURIComponent(tableName)}`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return { hiddenColumns: [], columnOrder: [] }
  const rows = (await res.json()) as { hidden_columns: string[] | null; column_order: string[] | null }[]
  return {
    hiddenColumns: rows[0]?.hidden_columns ?? [],
    columnOrder: rows[0]?.column_order ?? [],
  }
}

/**
 * Fetch id → category_code mapping from tb_category_mst.
 * Used to resolve FK columns (e.g. catgegory_id) to human-readable codes.
 */
export async function getCategoryIdMap(): Promise<Record<string, string>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_category_mst?select=id,category_code`,
    { headers: authHeaders(), next: { revalidate: 60 } },
  )
  if (!res.ok) return {}
  const rows = (await res.json()) as { id: string; category_code: string }[]
  return Object.fromEntries(rows.map((r) => [String(r.id), r.category_code]))
}

// category_code는 카테고리 유형(RAW/SKU)별로 중복될 수 있다 (예: SDS가 원재료·생산품
// 분류와 판매품 분류에 각각 다른 이름으로 존재) — 반드시 유형으로 구분해서 조회해야 한다.
// tb_raw_mst·tb_prod_mst는 DB상 category_type="RAW & PROD" 값을 공유해서 쓰고
// (원재료와 생산품이 같은 카테고리 코드 체계를 쓰기 때문), tb_sku_mst는 "SKU" 유형을 쓴다.
// 호출부는 읽기 쉬운 "RAW"만 넘기고, 실제 DB에 저장된 문자열로 여기서 변환한다.
// 옵션 라벨에 "코드 : 명칭"을 함께 보여주고, 원문 설명은 description으로 함께 내려준다.
const CATEGORY_TYPE_DB_VALUE: Record<"RAW" | "SKU", string> = {
  RAW: "RAW & PROD",
  SKU: "SKU",
}

export async function getCategoryOptions(
  categoryType: "RAW" | "SKU",
): Promise<{ value: string; label: string; description?: string }[]> {
  const dbCategoryType = CATEGORY_TYPE_DB_VALUE[categoryType]
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_category_mst?select=category_code,category_name_kr,description&category_type=eq.${encodeURIComponent(dbCategoryType)}&order=sort_order`,
    { headers: authHeaders(), next: { revalidate: 60 } },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as {
    category_code: string
    category_name_kr: string | null
    description: string | null
  }[]
  return rows.map((r) => ({
    value: r.category_code,
    label: r.category_name_kr ? `${r.category_code} : ${r.category_name_kr}` : r.category_code,
    description: r.description ?? undefined,
  }))
}

// 포장 부자재(tb_submat_mst)용 별도 카테고리 테이블 — tb_category_mst와는 독립적이며
// 코드 중복이 없어 유형 구분 없이 그대로 조회한다. category_type(포장재/소모품)을
// 대분류 설명으로 함께 보여준다.
export async function getSubmatCategoryOptions(): Promise<
  { value: string; label: string; description?: string }[]
> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_submat_category_mst?select=category_code,category_name,category_type&order=sort_order`,
    { headers: authHeaders(), next: { revalidate: 60 } },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as {
    category_code: string
    category_name: string | null
    category_type: string | null
  }[]
  return rows.map((r) => ({
    value: r.category_code,
    label: r.category_name ? `${r.category_code} : ${r.category_name}` : r.category_code,
    description: r.category_type ?? undefined,
  }))
}

/**
 * Compute the next code for a given category in `table.column`, based on the highest
 * existing sequence number sharing that category prefix (e.g. VFR-029 → VFR-030).
 */
async function getNextSequentialCode(
  table: string,
  column: string,
  categoryCode: string,
  separator: "-" | "_",
  codePrefix = "",
): Promise<string> {
  const category = categoryCode.trim().toUpperCase()
  const prefix = `${codePrefix}${category}`
  const fallback = `${prefix}${separator}001`
  if (!category) return fallback

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=${column}&${column}=ilike.${encodeURIComponent(prefix)}${separator}*&order=${column}.desc&limit=1`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return fallback

  const rows = (await res.json()) as Record<string, string>[]
  const value = rows[0]?.[column]
  const match = value?.match(new RegExp(`^(.*?)${separator}(\\d+)$`))
  if (!match) return fallback

  const [, matchedPrefix, seq] = match
  const next = (Number.parseInt(seq, 10) + 1).toString().padStart(seq.length, "0")
  return `${matchedPrefix}${separator}${next}`
}

export async function getNextSkuCode(categoryCode: string): Promise<string> {
  return getNextSequentialCode("tb_sku_mst", "sku_code", categoryCode, "_")
}

// 원자재/생산품 코드는 RAW-/PROD- 접두사 + 하이픈 구분 형식 (예: RAW-SDS-001, PROD-VFR-002)
export async function getNextRawCode(categoryCode: string): Promise<string> {
  return getNextSequentialCode("tb_raw_mst", "raw_code", categoryCode, "-", "RAW-")
}

export async function getNextProdCode(categoryCode: string): Promise<string> {
  return getNextSequentialCode("tb_prod_mst", "prod_code", categoryCode, "-", "PROD-")
}

// 방법서 코드는 카테고리 구분 없이 SOP-001, SOP-002 ... 순으로 채번한다.
export async function getNextSopCode(): Promise<string> {
  return getNextSequentialCode("tb_sop_mst", "sop_code", "SOP", "-")
}

/**
 * Fetch id → display label mapping for tb_sku_mst (used in tb_sku_recipe dropdown).
 */
export async function getSkuOptions(): Promise<{ value: string; label: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_sku_mst?select=id,sku_code,sku_name&order=sku_code`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as { id: string; sku_code?: string; sku_name?: string }[]
  return rows.map((r) => ({
    value: r.id,
    label: [r.sku_code, r.sku_name].filter(Boolean).join(" · ") || r.id,
  }))
}

/**
 * Fetch id → display label mapping for tb_prod_mst (used in tb_sku_recipe dropdown).
 */
export async function getProdOptions(): Promise<{ value: string; label: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_prod_mst?select=id,prod_code,prod_name&order=prod_code`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as { id: string; prod_code?: string; prod_name?: string }[]
  return rows.map((r) => ({
    value: r.id,
    label: [r.prod_code, r.prod_name].filter(Boolean).join(" · ") || r.id,
  }))
}

/**
 * Fetch id → display label mapping for tb_raw_mst (used in tb_prod_recipe dropdown).
 */
export async function getRawOptions(): Promise<{ value: string; label: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_raw_mst?select=id,raw_code,raw_name&order=raw_code`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as { id: string; raw_code?: string; raw_name?: string }[]
  return rows.map((r) => ({
    value: r.id,
    label: [r.raw_code, r.raw_name].filter(Boolean).join(" · ") || r.id,
  }))
}

/**
 * 임의 테이블의 id → 라벨 컬럼 옵션 목록 조회 (FK 드롭다운/이름 표시용).
 */
export async function getIdLabelOptions(
  table: string,
  labelColumn: string,
  idColumn = "id",
): Promise<{ value: string; label: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(idColumn)},${encodeURIComponent(labelColumn)}&order=${encodeURIComponent(labelColumn)}`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows.map((r) => ({
    value: String(r[idColumn]),
    label: String(r[labelColumn] ?? r[idColumn]),
  }))
}

/**
 * parts 목록을 code까지 포함해 조회 — 직원 관리에서 지점 scope(store/hq)별로
 * 배정 가능한 파트를 code 기준으로 좁히는 데 쓴다 (이름만으로는 구분 불가).
 */
export async function getPartOptionsWithCode(): Promise<{ value: string; label: string; code: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/parts?select=id,code,name_ko&order=sort_order`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as { id: string; code: string; name_ko: string }[]
  return rows.map((r) => ({ value: r.id, label: r.name_ko, code: r.code }))
}

/**
 * 지점 id → scope("store" | "hq") 맵. 직원 관리에서 직원이 소속된 지점의 scope에 따라
 * 파트 선택지를 좁히는 데 쓴다(매장=서비스/키친, 본사=경영지원/재무회계).
 */
export async function getStoreScopeMap(): Promise<Record<string, string>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_store_mst?select=id,scope`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return {}
  const rows = (await res.json()) as { id: string; scope: string }[]
  return Object.fromEntries(rows.map((r) => [r.id, r.scope]))
}

/**
 * Fetch id → display label mapping for tb_zone_type_mst (전사 공통 Zone 정의).
 * TB_SUBMAT_MST 등 전사 공통 카탈로그 테이블은 zone_id가 아닌 zone_type_id를 참조한다.
 * (물리 실체를 참조하는 자산·재고·로그 테이블만 zone_id를 참조 — 서대표 확정 v1.0 원칙)
 */
export async function getZoneTypeOptions(): Promise<{ value: string; label: string; group?: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_zone_type_mst?select=zone_type_id,zone_type_code,zone_type_name,zone_group&order=zone_type_code`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as {
    zone_type_id: string
    zone_type_code?: string
    zone_type_name?: string
    zone_group?: string
  }[]
  return rows.map((r) => ({
    value: r.zone_type_id,
    label: [r.zone_type_code, r.zone_type_name].filter(Boolean).join(" · ") || r.zone_type_id,
    // 관리 파트(SP/KP)별로 존 선택지를 좁힐 때 씀 (예: 포장 부자재의 "존 추가")
    group: r.zone_group,
  }))
}

/**
 * Fetch id → display label mapping for tb_zone_mst (지점명 · 구역유형 조합).
 * tb_zone_mst 자체엔 사람이 읽는 코드/이름 컬럼이 없어 지점·구역유형을 조인해 라벨을 만든다.
 * (물리 실체를 참조하는 tb_asset_mst 등에서 구역을 표시할 때 사용)
 */
export async function getZoneOptions(): Promise<{ value: string; label: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_zone_mst?select=zone_id,tb_store_mst(store_name),tb_zone_type_mst(zone_type_name)`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as {
    zone_id: string
    tb_store_mst: { store_name?: string } | null
    tb_zone_type_mst: { zone_type_name?: string } | null
  }[]
  return rows.map((r) => ({
    value: r.zone_id,
    label:
      [r.tb_store_mst?.store_name, r.tb_zone_type_mst?.zone_type_name].filter(Boolean).join(" · ") ||
      r.zone_id,
  }))
}

export type SubmatZoneLink = { submat_id: string; zone_type_id: string }

/**
 * Fetch all 포장 부자재 ↔ Zone유형 연결 (tb_submat_zone_link).
 * 테이블이 아직 생성되지 않은 경우 빈 배열을 반환해 화면이 깨지지 않게 한다.
 */
export async function getSubmatZoneLinks(): Promise<SubmatZoneLink[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_submat_zone_link?select=submat_id,zone_type_id`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) return []
  return (await res.json()) as SubmatZoneLink[]
}

/**
 * Insert a single row into a table. 감사 로그가 생성된 PK를 남길 수 있도록 삽입된 행을 반환한다
 * (return=representation).
 */
export async function insertTableRow(
  table: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    let body = ""
    try {
      body = await res.text()
    } catch {}
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  revalidateTableCache(table)
  try {
    const rows = (await res.json()) as Record<string, unknown>[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

export type SalesOrderRecord = {
  id: string
  platform: string
  order_datetime: string
  status: string
  total_amount: number | null
  settlement_amount: number | null
}

/**
 * Fetch 홀(POS)/쿠팡이츠/배민 매출 주문 (tb_sales_order) — [startIso, endIsoExclusive) 구간.
 * 테이블이 아직 생성되지 않은 경우(마이그레이션 미실행) null을 반환해 페이지에서 안내 문구를 보여줄 수 있게 한다.
 */
export async function getSalesOrdersInRange(
  startIso: string,
  endIsoExclusive: string,
): Promise<SalesOrderRecord[] | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/tb_sales_order` +
    `?select=id,platform,order_datetime,status,total_amount,settlement_amount` +
    `&order_datetime=gte.${encodeURIComponent(startIso)}` +
    `&order_datetime=lt.${encodeURIComponent(endIsoExclusive)}` +
    `&order=order_datetime.asc`

  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null
    throw new Error(`Failed to read sales orders (${res.status})`)
  }

  return (await res.json()) as SalesOrderRecord[]
}

export type SalesOrderItemRecord = {
  order_id: string
  sku_id: string | null
  quantity: number
  subtotal: number | null
  is_canceled: boolean
}

/**
 * Fetch 전체 주문 품목(tb_sales_order_item) — 메뉴 분석(카테고리 드릴다운)용.
 * 현재 데이터 규모(수백 건)에서는 기간 필터 없이 전체를 가져와 호출 측에서
 * order_id 기준으로 기간 내 주문에 매칭시키는 편이 PostgREST 임베드 조인보다 단순하고 안전하다.
 */
export async function getAllSalesOrderItems(): Promise<SalesOrderItemRecord[] | null> {
  const url = `${SUPABASE_URL}/rest/v1/tb_sales_order_item?select=order_id,sku_id,quantity,subtotal,is_canceled`
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null
    throw new Error(`Failed to read sales order items (${res.status})`)
  }
  return (await res.json()) as SalesOrderItemRecord[]
}

export type SkuMenuRecord = {
  id: string
  sku_code: string
  sku_name: string
  category_code: string | null
  sell_price: number | null
}

/** 판매품(tb_sku_mst) — 메뉴 분석 카테고리/매출 집계용. */
export async function getSkuMenuRecords(): Promise<SkuMenuRecord[]> {
  const url = `${SUPABASE_URL}/rest/v1/tb_sku_mst?select=id,sku_code,sku_name,category_code,sell_price&order=sku_code`
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })
  if (!res.ok) return []
  return (await res.json()) as SkuMenuRecord[]
}

export type SkuCategoryRecord = {
  category_code: string
  category_name_kr: string
  emoji: string | null
  sort_order: number
}

/** 판매 카테고리(tb_category_mst, category_type=SKU) — sort_order 순. */
export async function getSkuCategories(): Promise<SkuCategoryRecord[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/tb_category_mst` +
    `?select=category_code,category_name_kr,emoji,sort_order&category_type=eq.SKU&order=sort_order.asc`
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })
  if (!res.ok) return []
  return (await res.json()) as SkuCategoryRecord[]
}

/**
 * Fetch 판매품(tb_sku_mst) 재고 관리용 목록 — 코드/이름/가격/재고수량.
 */
export type SkuStockRow = {
  id: string
  sku_code: string
  sku_name: string
  category_code: string | null
  sell_price: number | null
  stock_qty: number
  is_active: boolean
}

export async function getSkuStockRows(): Promise<SkuStockRow[] | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/tb_sku_mst` +
    `?select=id,sku_code,sku_name,category_code,sell_price,stock_qty,is_active` +
    `&order=sku_code.asc`

  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null
    throw new Error(`Failed to read SKU stock (${res.status})`)
  }

  return (await res.json()) as SkuStockRow[]
}

/**
 * 원재료(tb_raw_mst)/생산품(tb_prod_mst)/포장부자재(tb_submat_mst) 재고 관리용 목록 — 1차 구현.
 * 판매품(getSkuStockRows)과 동일한 패턴: 지점/존 구분 없이 단일 stock_qty 컬럼만 관리한다.
 */
export type RawStockRow = {
  id: string
  raw_code: string
  raw_name: string
  category_code: string | null
  stock_qty: number
  is_active: boolean
}

export async function getRawStockRows(): Promise<RawStockRow[] | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/tb_raw_mst` +
    `?select=id,raw_code,raw_name,category_code,stock_qty,is_active` +
    `&order=raw_code.asc`

  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null
    throw new Error(`Failed to read 원재료 stock (${res.status})`)
  }

  return (await res.json()) as RawStockRow[]
}

export type ProdStockRow = {
  id: string
  prod_code: string
  prod_name: string
  category_code: string | null
  stock_qty: number
  is_active: boolean
}

export async function getProdStockRows(): Promise<ProdStockRow[] | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/tb_prod_mst` +
    `?select=id,prod_code,prod_name,category_code,stock_qty,is_active` +
    `&order=prod_code.asc`

  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null
    throw new Error(`Failed to read 생산품 stock (${res.status})`)
  }

  return (await res.json()) as ProdStockRow[]
}

export type SubmatStockRow = {
  submat_id: string
  item_name: string
  category_code: string | null
  stock_qty: number
  is_active: boolean
}

export async function getSubmatStockRows(): Promise<SubmatStockRow[] | null> {
  const url =
    `${SUPABASE_URL}/rest/v1/tb_submat_mst` +
    `?select=submat_id,item_name,category_code,stock_qty,is_active` +
    `&order=submat_id.asc`

  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" })

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null
    throw new Error(`Failed to read 포장부자재 stock (${res.status})`)
  }

  return (await res.json()) as SubmatStockRow[]
}

/**
 * 최근 등록된 판매품(tb_sku_mst)과 그 판매 레시피(tb_sku_recipe → tb_prod_mst 구성) 조회.
 * 챗봇의 "최근 등록된 판매 레시피" 질문에 대응.
 */
export type RecentSkuRecipe = {
  sku_code: string
  sku_name: string
  created_at: string
  items: {
    prod_code: string
    prod_name: string
    amount: number | null
    unit: string | null
    memo: string | null
  }[]
}

export async function getRecentSkuRecipes(limit = 3): Promise<RecentSkuRecipe[]> {
  const skuUrl =
    `${SUPABASE_URL}/rest/v1/tb_sku_mst` +
    `?select=id,sku_code,sku_name,created_at&order=created_at.desc&limit=${limit}`
  const skuRes = await fetch(skuUrl, { headers: authHeaders(), cache: "no-store" })
  if (!skuRes.ok) throw new Error(`Failed to read tb_sku_mst (${skuRes.status})`)
  const skus = (await skuRes.json()) as {
    id: string
    sku_code: string
    sku_name: string
    created_at: string
  }[]
  if (skus.length === 0) return []

  const skuIdsFilter = skus.map((s) => `"${s.id}"`).join(",")
  const recipeUrl =
    `${SUPABASE_URL}/rest/v1/tb_sku_recipe?select=sku_id,prod_id,amount,unit,memo` +
    `&sku_id=in.${encodeURIComponent(`(${skuIdsFilter})`)}`
  const recipeRes = await fetch(recipeUrl, { headers: authHeaders(), cache: "no-store" })
  if (!recipeRes.ok) throw new Error(`Failed to read tb_sku_recipe (${recipeRes.status})`)
  const recipeRows = (await recipeRes.json()) as {
    sku_id: string
    prod_id: string
    amount: number | null
    unit: string | null
    memo: string | null
  }[]

  const prodIds = [...new Set(recipeRows.map((r) => r.prod_id))]
  let prodMap: Record<string, { prod_code: string; prod_name: string }> = {}
  if (prodIds.length > 0) {
    const prodIdsFilter = prodIds.map((id) => `"${id}"`).join(",")
    const prodUrl =
      `${SUPABASE_URL}/rest/v1/tb_prod_mst?select=id,prod_code,prod_name` +
      `&id=in.${encodeURIComponent(`(${prodIdsFilter})`)}`
    const prodRes = await fetch(prodUrl, { headers: authHeaders(), cache: "no-store" })
    if (prodRes.ok) {
      const prodRows = (await prodRes.json()) as { id: string; prod_code: string; prod_name: string }[]
      prodMap = Object.fromEntries(prodRows.map((p) => [p.id, { prod_code: p.prod_code, prod_name: p.prod_name }]))
    }
  }

  return skus.map((sku) => ({
    sku_code: sku.sku_code,
    sku_name: sku.sku_name,
    created_at: sku.created_at,
    items: recipeRows
      .filter((r) => r.sku_id === sku.id)
      .map((r) => ({
        prod_code: prodMap[r.prod_id]?.prod_code ?? r.prod_id,
        prod_name: prodMap[r.prod_id]?.prod_name ?? "(알 수 없음)",
        amount: r.amount,
        unit: r.unit,
        memo: r.memo,
      })),
  }))
}

export type StoreScopeOptions = { filters?: EqFilter[]; inFilters?: InFilter[] }

/**
 * 매장 스코핑 조회 옵션 계산 (시니어가 아닌 직원은 본인 매장 데이터만 보이도록).
 * - store_id를 직접 가진 테이블(STORE_SCOPED_TABLES): eq 필터.
 * - zone_id로만 간접 연결된 테이블(STORE_SCOPED_VIA_ZONE_TABLES, 예: tb_asset_mst):
 *   tb_zone_mst에서 해당 매장 소속 zone_id 목록을 먼저 구해 in 필터로 돌려준다.
 * 시니어이거나 스코핑 대상 테이블이 아니면 빈 옵션(전체 조회)을 반환한다.
 */
export async function getStoreScopeOptions(
  tableName: string,
  isSenior: boolean,
  storeId: string | null,
): Promise<StoreScopeOptions> {
  const directFilters = buildStoreScopeFilter(tableName, isSenior, storeId)
  if (directFilters) return { filters: directFilters }
  if (isSenior) return {}

  const zoneColumn = STORE_SCOPED_VIA_ZONE_TABLES[tableName]
  if (!zoneColumn) return {}
  if (!storeId) return { inFilters: [{ column: zoneColumn, values: [] }] }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tb_zone_mst?select=zone_id&store_id=eq.${encodeURIComponent(storeId)}`,
    { headers: authHeaders(), cache: "no-store" },
  )
  const zones = res.ok ? ((await res.json()) as { zone_id: string }[]) : []
  return { inFilters: [{ column: zoneColumn, values: zones.map((z) => z.zone_id) }] }
}

/**
 * Fetch just the exact row count for a table (cheap HEAD-style request).
 */
export async function getTableCount(
  table: string,
  filters?: EqFilter[],
  inFilters?: InFilter[],
): Promise<number | null> {
  let url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`
  for (const f of filters ?? []) {
    url += `&${encodeURIComponent(f.column)}=eq.${encodeURIComponent(f.value)}`
  }
  for (const f of inFilters ?? []) {
    const value = f.values.length > 0 ? `in.(${f.values.join(",")})` : "eq.00000000-0000-0000-0000-000000000000"
    url += `&${encodeURIComponent(f.column)}=${encodeURIComponent(value)}`
  }
  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
      Prefer: "count=exact",
    },
    cache: "no-store",
  })

  if (!res.ok) return null

  const contentRange = res.headers.get("content-range")
  if (!contentRange) return null
  const parsed = Number.parseInt(contentRange.split("/")[1], 10)
  return Number.isNaN(parsed) ? null : parsed
}
