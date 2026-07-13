import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { createClient } from "@/lib/supabase/server"
import {
  getTables,
  getAllTableRows,
  getSkuOptions,
  getProdOptions,
  getCategoryIdMap,
} from "@/lib/supabase/db"
import { COLUMN_LABELS } from "@/lib/column-labels"
import {
  TABLE_DEFAULT_SORT,
  TABLE_SEARCH_COLUMNS,
  TABLE_LABELS,
  HIDDEN_COLS,
  TABLE_HIDDEN_COLS,
  TABLE_COLUMN_ORDER,
  ALLERGEN_OPTIONS,
  isPriceColumn,
} from "@/lib/table-config"

/**
 * 데이터 테이블 엑셀 추출.
 * 화면과 동일한 검색(q)/정렬(sort, dir) 조건으로 매칭되는 "모든" 행을 .xlsx로 내려준다.
 * 검색 후 추출하면 검색 결과만 담긴다.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  // 대시보드와 동일한 인증 게이트
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { table } = await params
  const tableName = decodeURIComponent(table)

  const sp = req.nextUrl.searchParams
  const sort = sp.get("sort") ?? undefined
  const dirParam = sp.get("dir")
  const dir: "asc" | "desc" | undefined =
    dirParam === "desc" ? "desc" : dirParam === "asc" ? "asc" : undefined
  const searchQuery = sp.get("q")?.trim() ?? ""

  const defaultSort = TABLE_DEFAULT_SORT[tableName]
  const sortColumn = sort || defaultSort?.column
  const sortDir: "asc" | "desc" = dir ?? defaultSort?.dir ?? "asc"
  const searchColumns = TABLE_SEARCH_COLUMNS[tableName] ?? []

  try {
    // 화면과 동일한 UUID → 이름 변환 준비 (셀 값도 사람이 읽는 값으로 추출)
    const columnResolvers: Record<string, Record<string, string>> = {}
    let idInColumns: { column: string; ids: string[] }[] | undefined

    if (tableName === "tb_sku_recipe") {
      const [skuOpts, prodOpts] = await Promise.all([
        getSkuOptions().catch(() => []),
        getProdOptions().catch(() => []),
      ])
      columnResolvers["sku_id"] = Object.fromEntries(skuOpts.map((o) => [o.value, o.label]))
      columnResolvers["prod_id"] = Object.fromEntries(prodOpts.map((o) => [o.value, o.label]))
      if (searchQuery) {
        const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase()
        const nq = norm(searchQuery)
        idInColumns = [
          { column: "sku_id",  ids: skuOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
          { column: "prod_id", ids: prodOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
        ]
      }
    }
    if (tableName === "tb_sku_mst") {
      columnResolvers["allergen_tags"] = Object.fromEntries(ALLERGEN_OPTIONS.map((o) => [o.value, o.label]))
    }
    if (tableName === "tb_prod_mst" || tableName === "tb_raw_mst") {
      columnResolvers["catgegory_id"] = await getCategoryIdMap().catch(() => ({}))
    }

    const rows = await getAllTableRows(tableName, {
      orderBy: sortColumn,
      orderDir: sortDir,
      search:
        searchColumns.length > 0 && searchQuery
          ? { columns: searchColumns, query: searchQuery, idInColumns }
          : undefined,
    })

    // 화면과 동일한 컬럼 구성 (숨김 컬럼 제외, 표시 순서 적용)
    let columns: string[] = []
    try {
      const tables = await getTables()
      columns = tables.find((t) => t.name === tableName)?.columns.map((c) => c.name) ?? []
    } catch {}
    if (columns.length === 0 && rows.length > 0) columns = Object.keys(rows[0])
    const tableHidden = TABLE_HIDDEN_COLS[tableName] ?? new Set<string>()
    columns = columns.filter((c) => !HIDDEN_COLS.has(c) && !tableHidden.has(c))
    const columnOrder = TABLE_COLUMN_ORDER[tableName]
    if (columnOrder) {
      columns = [
        ...columnOrder.filter((c) => columns.includes(c)),
        ...columns.filter((c) => !columnOrder.includes(c)),
      ]
    }

    const formatValue = (col: string, value: unknown): string | number | boolean => {
      if (value === null || value === undefined) return ""
      const resolver = columnResolvers[col]
      if (Array.isArray(value)) {
        return value.map((v) => resolver?.[String(v)] ?? String(v)).join(", ")
      }
      if (typeof value === "number" || typeof value === "boolean") return value
      if (typeof value === "object") return JSON.stringify(value)
      const text = String(value)
      // 가격 컬럼이 문자열로 저장돼 있어도 숫자 셀로 변환 (쉼표 서식 적용 대상)
      if (isPriceColumn(col) && text.trim() !== "" && !Number.isNaN(Number(text))) {
        return Number(text)
      }
      // JSON 배열 문자열 (예: '["MILK","EGG"]')
      if (text.startsWith("[")) {
        try {
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed)) {
            return parsed.map((v) => resolver?.[String(v)] ?? String(v)).join(", ")
          }
        } catch {}
      }
      return resolver?.[text] ?? text
    }

    const header = columns.map((c) => COLUMN_LABELS[c] ?? c)
    const data = rows.map((r) => columns.map((c) => formatValue(c, r[c])))

    const ws = XLSX.utils.aoa_to_sheet([header, ...data])
    // 가격 컬럼: 천 단위 쉼표 서식 (예: 10,000)
    columns.forEach((c, ci) => {
      if (!isPriceColumn(c)) return
      for (let ri = 1; ri <= data.length; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })]
        if (cell && cell.t === "n") cell.z = "#,##0"
      }
    })
    // 대략적인 컬럼 폭 자동 조정 (한글은 2칸 기준, 최대 50칸)
    const width = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)
    ws["!cols"] = columns.map((_, i) => ({
      wch: Math.min(
        50,
        Math.max(width(header[i]), ...data.slice(0, 200).map((row) => width(String(row[i] ?? "")))) + 2,
      ),
    }))

    const label = TABLE_LABELS[tableName] ?? tableName
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31))
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

    const date = new Date().toISOString().slice(0, 10)
    const filename = `${label}${searchQuery ? `_검색_${searchQuery}` : ""}_${date}.xlsx`

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // 한글 파일명: RFC 5987 filename* + ASCII 폴백
        "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed"
    return new NextResponse(message, { status: 500 })
  }
}
