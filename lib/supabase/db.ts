import "server-only"
import { SUPABASE_URL } from "./config"

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
}

export type TableRowsOptions = {
  orderBy?: string
  orderDir?: "asc" | "desc"
  search?: {
    columns: string[]
    query: string
    // FK 컬럼을 사람이 읽을 수 있는 값(예: sku_code)으로 검색할 때, 미리 매칭해 둔 id 목록으로 필터링
    idInColumns?: { column: string; ids: string[] }[]
  }
}

/**
 * Fetch a page of rows from a table along with the exact total count.
 */
export async function getTableRows(
  table: string,
  limit = 50,
  offset = 0,
  options?: TableRowsOptions,
): Promise<TableRows> {
  let url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${limit}&offset=${offset}`

  if (options?.orderBy) {
    url += `&order=${encodeURIComponent(options.orderBy)}.${options.orderDir === "desc" ? "desc" : "asc"}`
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

  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
      Prefer: "count=exact",
    },
    cache: "no-store",
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

  return { rows, total }
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
 * Insert a single row into a table.
 */
export async function insertTableRow(
  table: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
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
}

/**
 * Fetch just the exact row count for a table (cheap HEAD-style request).
 */
export async function getTableCount(table: string): Promise<number | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, {
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
