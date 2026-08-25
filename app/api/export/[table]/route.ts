import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { createClient } from "@/lib/supabase/server"
import { getCurrentEmployee } from "@/lib/permissions"
import {
  getTables,
  getAllTableRows,
  getStoreScopeOptions,
  getSkuOptions,
  getProdOptions,
  getRawOptions,
  getCategoryIdMap,
  getIdLabelOptions,
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
  EMPLOYEE_FK_LOOKUPS,
  isPriceColumn,
} from "@/lib/table-config"
import { parseImageCode } from "@/lib/image-code"
import { resolveImageByCode } from "@/lib/photo-resolve"

// 사진이 있는 테이블 → 사진 코드가 담긴 컬럼(sourceColumn, 예: raw_code "RAW-BEV-001")과,
// 화면(CellContent)이 이미 이미지로 특수 처리하는 실제 DB 컬럼이 있다면 그 이름(existingPhotoColumn).
// tb_raw_mst는 "photo" 컬럼 자리에 화면에서도 PhotoCell로 사진을 보여주므로 그 자리를 그대로 재사용한다.
// tb_prod_mst는 뺐다 — 원재료(RAW-*)와 생산품(PROD-*) 코드가 같은 카테고리-번호를 공유해서
// (예: RAW-BEV-001 / PROD-BEV-001) 같은 이미지 파일을 가리키는데, 생산품 사진은 따로 관리된 적이
// 없어 이 컬럼을 켜두면 전혀 무관한 원재료 사진이 생산품 사진인 것처럼 잘못 나온다 (components/data-table.tsx의
// NO_IMAGE_COLS와 동일한 이유).
const PHOTO_CONFIG: Record<string, { sourceColumn: string; existingPhotoColumn?: string }> = {
  tb_raw_mst: { sourceColumn: "raw_code", existingPhotoColumn: "photo" },
}

// ExcelJS가 임베드 지원하는 이미지 형식 (jpg는 jpeg로, webp는 미지원이라 건너뜀)
function toExcelImageExtension(ext: string): "jpeg" | "png" | "gif" | null {
  if (ext === "jpg" || ext === "jpeg") return "jpeg"
  if (ext === "png") return "png"
  if (ext === "gif") return "gif"
  return null
}

/**
 * 데이터 테이블 엑셀 추출.
 * 화면과 동일한 검색(q)/정렬(sort, dir) 조건으로 매칭되는 "모든" 행을 .xlsx로 내려준다.
 * 검색 후 추출하면 검색 결과만 담긴다. 원재료/생산품은 사진도 함께 셀에 임베드한다.
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
    if (tableName === "tb_prod_recipe") {
      const [prodOpts, rawOpts] = await Promise.all([
        getProdOptions().catch(() => []),
        getRawOptions().catch(() => []),
      ])
      columnResolvers["prod_id"] = Object.fromEntries(prodOpts.map((o) => [o.value, o.label]))
      columnResolvers["raw_id"]  = Object.fromEntries(rawOpts.map((o) => [o.value, o.label]))
      if (searchQuery) {
        const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase()
        const nq = norm(searchQuery)
        idInColumns = [
          { column: "prod_id", ids: prodOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
          { column: "raw_id",  ids: rawOpts.filter((o) => norm(o.label).includes(nq)).map((o) => o.value) },
        ]
      }
    }
    if (tableName === "tb_sku_mst") {
      columnResolvers["allergen_tags"] = Object.fromEntries(ALLERGEN_OPTIONS.map((o) => [o.value, o.label]))
    }
    if (tableName === "tb_prod_mst" || tableName === "tb_raw_mst") {
      columnResolvers["catgegory_id"] = await getCategoryIdMap().catch(() => ({}))
    }
    if (tableName === "employees") {
      const lookups = await Promise.all(
        EMPLOYEE_FK_LOOKUPS.map((l) => getIdLabelOptions(l.table, l.labelColumn).catch(() => [])),
      )
      EMPLOYEE_FK_LOOKUPS.forEach((l, i) => {
        columnResolvers[l.column] = Object.fromEntries(lookups[i].map((o) => [o.value, o.label]))
      })
    }

    const employee = await getCurrentEmployee()
    const storeScope = await getStoreScopeOptions(tableName, employee?.isSenior ?? false, employee?.storeId ?? null)

    const rows = await getAllTableRows(tableName, {
      orderBy: sortColumn,
      orderDir: sortDir,
      search:
        searchColumns.length > 0 && searchQuery
          ? { columns: searchColumns, query: searchQuery, idInColumns }
          : undefined,
      ...storeScope,
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

    // 사진 컬럼 위치 정하기: tb_raw_mst처럼 화면에서 이미 이미지로 특수 처리하는 실제 컬럼("photo")이
    // 있으면 그 자리를 그대로 쓰고(중복 컬럼 방지), 없으면(tb_prod_mst) 맨 앞에 새로 끼워 넣는다.
    const photoConfig = PHOTO_CONFIG[tableName]
    const hasPhotoColumn = !!photoConfig && columns.includes(photoConfig.sourceColumn)
    let photoColumn: string | null = null
    if (hasPhotoColumn) {
      if (photoConfig.existingPhotoColumn && columns.includes(photoConfig.existingPhotoColumn)) {
        photoColumn = photoConfig.existingPhotoColumn
      } else {
        photoColumn = "__photo__"
        columns = ["__photo__", ...columns]
      }
    }

    const photosByRow = hasPhotoColumn && photoConfig
      ? await Promise.all(
          rows.map(async (r) => {
            const code = String(r[photoConfig.sourceColumn] ?? "")
            const parsed = parseImageCode(code)
            if (!parsed) return null
            return resolveImageByCode(parsed.category, parsed.num)
          }),
        )
      : []

    const header = columns.map((c) => (c === "__photo__" ? "사진" : COLUMN_LABELS[c] ?? c))

    const workbook = new ExcelJS.Workbook()
    const label = TABLE_LABELS[tableName] ?? tableName
    const worksheet = workbook.addWorksheet(label.slice(0, 31))

    const headerRow = worksheet.addRow(header)
    headerRow.font = { bold: true }

    rows.forEach((r, ri) => {
      const rowValues = columns.map((c) => (c === photoColumn ? "" : formatValue(c, r[c])))
      const row = worksheet.addRow(rowValues)
      if (hasPhotoColumn) row.height = 60

      columns.forEach((c, ci) => {
        if (isPriceColumn(c)) {
          const cell = row.getCell(ci + 1)
          if (typeof cell.value === "number") cell.numFmt = "#,##0"
        }
      })

      const photo = hasPhotoColumn ? photosByRow[ri] : null
      if (photo) {
        const excelExt = toExcelImageExtension(photo.ext)
        const photoColIndex = columns.indexOf(photoColumn!)
        if (excelExt && photoColIndex !== -1) {
          const imageId = workbook.addImage({ buffer: photo.buffer as unknown as ExcelJS.Buffer, extension: excelExt })
          // 사진 열의 셀 안에 꽉 차게(마진 4px) 배치 — row.number/col은 0-based
          worksheet.addImage(imageId, {
            tl: { col: photoColIndex + 0.06, row: row.number - 1 + 0.06 },
            ext: { width: 72, height: 72 },
          })
        }
      }
    })

    // 대략적인 컬럼 폭 자동 조정 (한글은 2칸 기준, 최대 50칸)
    const width = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)
    columns.forEach((c, ci) => {
      const col = worksheet.getColumn(ci + 1)
      if (c === photoColumn) {
        col.width = 12
        return
      }
      const dataWidths = rows.slice(0, 200).map((r) => width(String(formatValue(c, r[c]) ?? "")))
      col.width = Math.min(50, Math.max(width(header[ci]), ...dataWidths) + 2)
    })

    const buf = await workbook.xlsx.writeBuffer()

    const date = new Date().toISOString().slice(0, 10)
    const filename = `${label}${searchQuery ? `_검색_${searchQuery}` : ""}_${date}.xlsx`

    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
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
