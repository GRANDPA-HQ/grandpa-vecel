"use client"

import Image from "next/image"
import Link from "next/link"
import { useState, useRef, useCallback, useEffect, Fragment, type ReactNode } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ArrowUp, ArrowDown, ArrowUpDown, ExternalLink, FileSpreadsheet, NotebookPen, Search, Trash2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { updateRow, deleteRow, deleteRows } from "@/app/actions/table-edit"
import { loadMoreRows } from "@/app/actions/table-rows"
import { COLUMN_LABELS } from "@/lib/column-labels"
import { isPriceColumn, type RowCursor } from "@/lib/table-config"
import { withBasePath } from "@/lib/base-path"
import { ColumnSettingsMenu } from "@/components/column-settings-menu"
import { SearchableSelect } from "@/components/searchable-select"
import { IMAGE_EXTS, parseImageCode } from "@/lib/image-code"

// description은 select 옵션에 hover 툴팁으로 표시 (예: 카테고리 코드 옆 설명)
type SelectOption = { value: string; label: string; description?: string }
type MultiOption = string | SelectOption

function toSelectOption(opt: MultiOption): SelectOption {
  return typeof opt === "string" ? { value: opt, label: opt } : opt
}

// 테이블.컬럼 → 선택지 목록 (이 컬럼은 select 드롭다운으로 편집)
const ENUM_COLUMNS: Record<string, { value: string; label: string; className: string }[]> = {
  "tb_production_process.status": [
    { value: "pending",  label: "검토 대기중", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { value: "approved", label: "승인됨",      className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { value: "rejected", label: "반려됨",      className: "bg-red-100 text-red-700 border-red-200" },
  ],
  "tb_prod_mst.status": [
    { value: "SEMI", label: "SEMI", className: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "PREP", label: "PREP", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { value: "COOK", label: "COOK", className: "bg-orange-100 text-orange-700 border-orange-200" },
    { value: "UNPROC", label: "UNPROC", className: "bg-gray-100 text-gray-700 border-gray-200" },
  ],
  "tb_raw_mst.storage": [
    { value: "냉장", label: "냉장", className: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "냉동", label: "냉동", className: "bg-sky-100 text-sky-700 border-sky-200" },
    { value: "상온", label: "상온", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ],
  "tb_sku_recipe.unit": [
    { value: "g",  label: "g",  className: "bg-green-100 text-green-700 border-green-200" },
    { value: "ml", label: "ml", className: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "ea", label: "ea", className: "bg-gray-100 text-gray-700 border-gray-200" },
  ],
  "tb_prod_recipe.unit": [
    { value: "g",  label: "g",  className: "bg-green-100 text-green-700 border-green-200" },
    { value: "ml", label: "ml", className: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "ea", label: "ea", className: "bg-gray-100 text-gray-700 border-gray-200" },
  ],
  "tb_prod_mst.storage": [
    { value: "냉장", label: "냉장", className: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "냉동", label: "냉동", className: "bg-sky-100 text-sky-700 border-sky-200" },
    { value: "상온", label: "상온", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ],
  // 직원 (CHECK 제약 허용 값)
  "employees.employment_type": [
    { value: "정규직",   label: "정규직",   className: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "파트타임", label: "파트타임", className: "bg-amber-100 text-amber-700 border-amber-200" },
    { value: "프리랜서", label: "프리랜서", className: "bg-purple-100 text-purple-700 border-purple-200" },
  ],
  "employees.status": [
    { value: "재직", label: "재직", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { value: "휴직", label: "휴직", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { value: "퇴사", label: "퇴사", className: "bg-gray-100 text-gray-500 border-gray-200" },
  ],
}

function parseMultiValue(val: string): string[] {
  if (!val) return []
  try {
    const p = JSON.parse(val)
    if (Array.isArray(p)) return p.map(String)
  } catch {}
  if (val.startsWith("{") && val.endsWith("}"))
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, ""))
  return []
}


function deriveImageSrc(code: string, extIdx: number): string | null {
  const parsed = parseImageCode(code)
  if (!parsed) return null
  // next/image는 unoptimized 문자열 src에 basePath("/os")를 자동으로 붙여주지 않아 직접 붙여야 한다
  // (add-base-path가 next/link 등에만 적용되고 image-component에는 없음 — 확인됨).
  return withBasePath(`/api/images/${parsed.category}/${parsed.category}-${parsed.num}.${IMAGE_EXTS[extIdx]}`)
}

function PhotoCell({ row }: { row: Record<string, unknown> }) {
  const code = String(row["raw_code"] ?? row["prod_code"] ?? "")
  const [extIdx, setExtIdx] = useState(0)
  const [failed, setFailed] = useState(false)

  const src = !failed ? deriveImageSrc(code, extIdx) : null

  if (!src) return <span className="text-muted-foreground">-</span>

  return (
    <Image
      src={src}
      alt={code}
      width={100}
      height={100}
      className="rounded object-contain"
      onError={() => {
        if (extIdx + 1 < IMAGE_EXTS.length) setExtIdx(extIdx + 1)
        else setFailed(true)
      }}
      unoptimized
    />
  )
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function CodeImageCell({ code }: { code: string }) {
  const [extIdx, setExtIdx] = useState(0)
  const [failed, setFailed] = useState(false)

  const src = !failed ? deriveImageSrc(code, extIdx) : null

  if (!src) return <span className="font-mono text-xs">{code}</span>

  return (
    <div className="flex flex-col items-center gap-1">
      <Image
        src={src}
        alt={code}
        width={100}
        height={100}
        className="rounded object-contain"
        onError={() => {
          if (extIdx + 1 < IMAGE_EXTS.length) setExtIdx(extIdx + 1)
          else setFailed(true)
        }}
        unoptimized
      />
      <span className="font-mono text-xs text-muted-foreground">{code}</span>
    </div>
  )
}

// 이미지를 표시하지 않을 컬럼 목록.
// - raw_code: tb_raw_mst의 실제 "photo_urls" 컬럼(PhotoCell)이 이미 같은 사진을 보여주므로 중복 렌더링 방지.
// - prod_code: 원재료(RAW-*)와 생산품(PROD-*) 코드가 같은 카테고리-번호 체계를 공유해서
//   (예: RAW-BEV-001 / PROD-BEV-001) images/BEV/BEV-001.* 파일을 함께 가리킨다. 생산품 사진은
//   따로 관리되는 적이 없어서, 이 컬럼에 이미지 추측을 켜두면 전혀 무관한 원재료 사진이 우연히
//   같은 카테고리-번호라는 이유만으로 생산품 사진인 것처럼 잘못 뜬다 — 그래서 아예 꺼둔다.
const NO_IMAGE_COLS = new Set(["raw_code", "sku_code", "prod_code"])

// 길어져도 잘라내지 않고 행이 커지면서 전체 내용을 보여줄 컬럼 (설명/메모류)
const LONG_TEXT_COLS = new Set(["description", "description_en", "memo", "note"])

// URL 값을 긴 원문 대신 도메인명 칩으로 간소화해 표시 (클릭 시 새 탭으로 열림)
function UrlChip({ url }: { url: string }) {
  let domain = "링크"
  try {
    domain = new URL(url).hostname.replace(/^www\./, "")
  } catch {}
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      <span className="truncate">{domain}</span>
    </a>
  )
}

function CellContent({
  col,
  value,
  row,
  columnResolvers,
  tableName,
}: {
  col: string
  value: unknown
  row: Record<string, unknown>
  columnResolvers?: Record<string, Record<string, string>>
  tableName?: string
}) {
  // tb_raw_mst.photo_urls만 raw_code 기반 코드-이미지 조회(PhotoCell)를 쓴다 — 값 자체는 무시하고
  // raw_code로 파일을 찾는 예전 방식이라, 실제 URL 배열을 담는 다른 테이블의 동명 컬럼과는 다르게 취급해야 한다.
  if (col === "photo_urls" && tableName === "tb_raw_mst") return <PhotoCell row={row} />
  // 가격 컬럼: 천 단위 쉼표 표시 (예: 10,000)
  if (isPriceColumn(col)) {
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))
          ? Number(value)
          : null
    if (n !== null) {
      return (
        <span title={String(value)} className="block truncate tabular-nums">
          {n.toLocaleString("ko-KR")}
        </span>
      )
    }
  }
  // 배열 값 처리 (Postgres array / JSONB array)
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">-</span>
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {columnResolvers?.[col]?.[String(v)] ?? String(v)}
          </span>
        ))}
      </div>
    )
  }
  const text = formatCell(value)
  if (text === "") return <span className="text-muted-foreground">null</span>
  // JSON 배열 문자열 처리
  if (text.startsWith("[") || (text.startsWith("{") && text.includes(","))) {
    const arr = parseMultiValue(text)
    if (arr.length > 0)
      return (
        <div className="flex flex-wrap gap-1">
          {arr.map((v, i) => (
            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {columnResolvers?.[col]?.[v] ?? v}
            </span>
          ))}
        </div>
      )
  }
  const resolved = columnResolvers?.[col]?.[text]
  if (resolved !== undefined)
    return <span title={text} className="block truncate">{resolved}</span>
  if (/^https?:\/\//i.test(text)) return <UrlChip url={text} />
  if (!NO_IMAGE_COLS.has(col) && parseImageCode(text)) return <CodeImageCell code={text.toUpperCase()} />
  if (LONG_TEXT_COLS.has(col))
    return <span className="block whitespace-pre-wrap break-words">{text}</span>
  return <span title={text} className="block truncate">{text}</span>
}

type ErrorEntry = {
  id: number
  timestamp: string
  column: string
  pkValue: string
  attempted: string
  message: string
}

const MIN_COL_WIDTH = 60
const MAX_COL_WIDTH = 800
const DEFAULT_COL_WIDTH = 160

// 열 헤더 오른쪽 경계의 드래그 핸들 — 마우스 다운 시 컬럼 리사이즈를 시작한다.
// onClick에서 stopPropagation을 걸어 핸들 클릭이 헤더의 정렬 클릭으로 전파되지 않게 한다.
// isActive: 이 핸들로 지금 드래그 중인 동안 true — 드래그 중엔 마우스가 12px 히트 영역을
// 벗어나 있어도(hover 상태가 아니어도) 강조 색이 계속 보이도록 유지한다.
function ResizeHandle({
  onMouseDown,
  onDoubleClick,
  isActive,
}: {
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  isActive: boolean
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onClick={(e) => e.stopPropagation()}
      title="드래그하여 너비 조절 (더블클릭으로 초기화)"
      className="group absolute -right-1.5 top-0 z-20 h-full w-3 cursor-col-resize touch-none select-none"
    >
      <div
        className={cn(
          "mx-auto h-full w-0.5 transition-colors",
          isActive ? "bg-primary" : "bg-transparent group-hover:bg-primary/40",
        )}
      />
    </div>
  )
}

function EditableCell({
  col,
  value,
  row,
  tableName,
  pkColumn,
  columnOptions,
  columnResolvers,
  columnMultiOptions,
  onRowUpdate,
  onError,
}: {
  col: string
  value: unknown
  row: Record<string, unknown>
  tableName: string
  pkColumn: string
  columnOptions?: Record<string, SelectOption[]>
  columnResolvers?: Record<string, Record<string, string>>
  columnMultiOptions?: Record<string, MultiOption[]>
  onRowUpdate: (pkValue: string, col: string, newValue: unknown) => void
  onError: (e: Omit<ErrorEntry, "id">) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editStr, setEditStr] = useState("")
  const [saving, setSaving] = useState(false)
  const escapeRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing || !textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [editing, editStr])

  const pkValue = String(row[pkColumn] ?? "")
  const canEdit = col !== pkColumn && !(col === "photo_urls" && tableName === "tb_raw_mst")
  const originalStr = formatCell(value)

  const enumKey = `${tableName}.${col}`
  const enumOpts = ENUM_COLUMNS[enumKey] ?? null
  const colOpts = columnOptions?.[col] ?? null
  const multiOpts = columnMultiOptions?.[col] ?? null

  const commitSave = useCallback(
    async (val: string) => {
      setEditing(false)
      if (val === originalStr || (val === "" && (value === null || value === undefined))) return

      setSaving(true)
      const originalType = value === null || value === undefined ? "null" : typeof value
      const result = await updateRow(tableName, pkColumn, pkValue, col, val, originalType)
      setSaving(false)

      if (result.error) {
        onError({
          timestamp: new Date().toLocaleString("ko-KR"),
          column: col,
          pkValue,
          attempted: val,
          message: result.error,
        })
      } else {
        let newValue: unknown = val
        if (val === "" || val === "null") newValue = null
        else if (originalType === "number") {
          const n = Number(val)
          if (!isNaN(n)) newValue = n
        } else if (originalType === "boolean") {
          if (val === "true") newValue = true
          else if (val === "false") newValue = false
        }
        onRowUpdate(pkValue, col, newValue)
      }
    },
    [originalStr, value, tableName, pkColumn, pkValue, col, onRowUpdate, onError],
  )

  const handleSave = useCallback(async () => {
    if (escapeRef.current) {
      escapeRef.current = false
      return
    }
    await commitSave(editStr)
  }, [editStr, commitSave])

  if (!canEdit) {
    return <CellContent col={col} value={value} row={row} columnResolvers={columnResolvers} tableName={tableName} />
  }

  // ── 다중 선택 체크박스 편집 모드 ──
  if (editing && multiOpts) {
    const selected = parseMultiValue(editStr)
    return (
      <div className="flex flex-col gap-1 rounded border border-ring bg-background p-2 shadow-md">
        {multiOpts.map((rawOpt) => {
          const opt = toSelectOption(rawOpt)
          return (
            <label key={opt.value} className="flex cursor-pointer select-none items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt.value]
                    : selected.filter((v) => v !== opt.value)
                  setEditStr(JSON.stringify(next))
                }}
                className="h-3.5 w-3.5 accent-primary"
              />
              {opt.label}
            </label>
          )
        })}
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            commitSave(editStr)
          }}
          className="mt-1 rounded bg-primary px-2 py-0.5 text-center text-[10px] font-medium text-primary-foreground"
        >
          확인
        </button>
      </div>
    )
  }

  // ── enum select 편집 모드 ──
  if (editing && enumOpts) {
    return (
      <select
        value={editStr}
        autoFocus
        onChange={(e) => {
          setEditStr(e.target.value)
          commitSave(e.target.value)
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            setEditing(false)
          }
        }}
        className="rounded border border-ring bg-background px-1 py-0.5 text-xs outline-none ring-1 ring-ring"
      >
        {enumOpts.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  // ── 일반 select 편집 모드 (category_code 등 동적 옵션) ──
  if (editing && colOpts) {
    return (
      <select
        value={editStr}
        autoFocus
        onChange={(e) => {
          setEditStr(e.target.value)
          commitSave(e.target.value)
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            setEditing(false)
          }
        }}
        className="rounded border border-ring bg-background px-1 py-0.5 text-xs outline-none ring-1 ring-ring"
      >
        <option value="">— 선택 —</option>
        {colOpts.map((opt) => (
          <option key={opt.value} value={opt.value} title={opt.description}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  // ── 일반 텍스트 편집 모드 (텍스트 전문이 보이도록 줄바꿈 + 자동 높이 조절) ──
  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={editStr}
        onChange={(e) => setEditStr(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSave()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            escapeRef.current = true
            setEditing(false)
          }
        }}
        rows={1}
        className="w-full min-w-[80px] resize-none whitespace-pre-wrap break-words rounded border border-ring bg-background px-1 py-0.5 font-mono text-xs outline-none ring-1 ring-ring"
        autoFocus
      />
    )
  }

  // ── 표시 모드 ──
  const enumDisplay = enumOpts?.find((o) => o.value === originalStr)
  const colDisplay = !enumDisplay ? colOpts?.find((o) => o.value === originalStr) : null

  return (
    <div
      onClick={() => {
        if (!saving) {
          setEditStr(originalStr)
          setEditing(true)
        }
      }}
      title={saving ? "저장 중..." : "클릭하여 편집"}
      className={`-mx-1 -my-0.5 cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-accent/60 ${saving ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {saving ? (
        <span className="font-mono text-xs text-muted-foreground italic">저장 중...</span>
      ) : enumDisplay ? (
        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${enumDisplay.className}`}>
          {enumDisplay.label}
        </span>
      ) : colDisplay ? (
        <span className="text-xs">{colDisplay.label}</span>
      ) : (
        <CellContent col={col} value={value} row={row} columnResolvers={columnResolvers} tableName={tableName} />
      )}
    </div>
  )
}

export function DataTable({
  columns,
  rows: initialRows,
  total,
  nextCursor: initialNextCursor,
  tableName,
  pkColumn,
  columnOptions,
  columnResolvers,
  columnMultiOptions,
  sortColumn,
  sortDir,
  searchQuery,
  searchEnabled,
  searchPlaceholder,
  bulkDeleteEnabled,
  rowLinks,
  extraColumn,
  allColumns,
  hiddenColumns,
  categoryFilter,
  extraFilter,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  total?: number | null
  nextCursor?: RowCursor | null
  tableName?: string
  pkColumn?: string | null
  columnOptions?: Record<string, SelectOption[]>
  columnResolvers?: Record<string, Record<string, string>>
  columnMultiOptions?: Record<string, MultiOption[]>
  sortColumn?: string
  sortDir?: "asc" | "desc"
  searchQuery?: string
  searchEnabled?: boolean
  searchPlaceholder?: string
  bulkDeleteEnabled?: boolean
  // 열 표시/숨김 설정용 — 숨김 처리되지 않은 전체 토글 대상 컬럼 목록과 그중 현재 숨겨진 컬럼
  allColumns?: string[]
  hiddenColumns?: string[]
  // PK 값 → 내부 링크 href. 값이 있는 행에만 링크 컬럼(header)을 표시한다
  // insertBeforeIndex: 지정한 인덱스의 실제 컬럼 바로 앞에 링크 컬럼을 끼워 넣는다 (미지정 시 맨 뒤)
  rowLinks?: { header: string; hrefByPk: Record<string, string>; insertBeforeIndex?: number }
  // 임의의 미리 렌더링된 셀을 맨 뒤에 추가 컬럼으로 붙인다 (예: 포장 부자재의 존 태그 편집 UI)
  extraColumn?: { header: string; cellsByPk: Record<string, ReactNode> }
  // 카테고리 선택 필터 — 검색창 옆에 표시되며 선택한 카테고리에 해당하는 행만 서버에서 조회한다.
  // placeholder/searchPlaceholder를 지정하면 "카테고리" 문구 대신 쓸 수 있다 (예: 시설의 "지점" 선택란).
  categoryFilter?: { column: string; options: SelectOption[]; placeholder?: string; searchPlaceholder?: string }
  // categoryFilter와 별개로 동작하는 두 번째 필터 (예: 시설 관리의 장비/집기/시설 상위 구분).
  // 값은 자체 URL 파라미터(paramName)에 저장되며, 실제 필터링은 페이지(서버 컴포넌트)가 담당한다.
  extraFilter?: { paramName: string; options: SelectOption[]; placeholder?: string }
}) {
  const [rows, setRows] = useState(initialRows)
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const errorCounter = useRef(0)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchQuery ?? "")

  const handleSort = useCallback(
    (col: string) => {
      const isActive = col === (searchParams.get("sort") || sortColumn)
      const currentDir = searchParams.get("dir") === "desc" ? "desc" : sortDir ?? "asc"
      const nextDir = isActive && currentDir === "asc" ? "desc" : "asc"

      const params = new URLSearchParams(searchParams.toString())
      params.set("sort", col)
      params.set("dir", nextDir)
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams, sortColumn, sortDir],
  )

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const params = new URLSearchParams(searchParams.toString())
      if (searchInput.trim()) params.set("q", searchInput.trim())
      else params.delete("q")
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams, searchInput],
  )

  const activeCategory = searchParams.get("category") ?? ""
  const handleCategoryChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set("category", value)
      else params.delete("category")
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const activeExtra = extraFilter ? searchParams.get(extraFilter.paramName) ?? "" : ""
  const handleExtraChange = useCallback(
    (value: string) => {
      if (!extraFilter) return
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(extraFilter.paramName, value)
      else params.delete(extraFilter.paramName)
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams, extraFilter],
  )

  const handleRowUpdate = useCallback(
    (pkValue: string, col: string, newValue: unknown) => {
      if (!pkColumn) return
      setRows((prev) =>
        prev.map((row) =>
          String(row[pkColumn] ?? "") === pkValue ? { ...row, [col]: newValue } : row,
        ),
      )
    },
    [pkColumn],
  )

  const handleError = useCallback((e: Omit<ErrorEntry, "id">) => {
    setErrors((prev) => [{ ...e, id: ++errorCounter.current }, ...prev])
  }, [])

  // ── 커서 페이지네이션: 스크롤 하단 도달 시(또는 버튼 클릭 시) 다음 페이지를 이어붙인다 ──
  const [cursor, setCursor] = useState<RowCursor | null>(initialNextCursor ?? null)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const activeSort = searchParams.get("sort") || sortColumn
  const activeDir: "asc" | "desc" | undefined = activeSort
    ? searchParams.get("dir") === "desc"
      ? "desc"
      : sortDir ?? "asc"
    : undefined

  const handleLoadMore = useCallback(async () => {
    if (!tableName || !pkColumn || !cursor || loadingRef.current) return
    loadingRef.current = true
    setLoadingMore(true)
    const result = await loadMoreRows(tableName, pkColumn, cursor, activeSort, activeDir, searchQuery)
    setLoadingMore(false)
    loadingRef.current = false
    if (result.error) {
      // 에러 시 커서를 비워 관찰자가 무한 재시도하지 않도록 한다
      setCursor(null)
      handleError({
        timestamp: new Date().toLocaleString("ko-KR"),
        column: "(더 불러오기)",
        pkValue: cursor.pkValue,
        attempted: "",
        message: result.error,
      })
    } else {
      setRows((prev) => [...prev, ...result.rows])
      setCursor(result.nextCursor)
    }
  }, [tableName, pkColumn, cursor, activeSort, activeDir, searchQuery, handleError])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !cursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) handleLoadMore()
      },
      { rootMargin: "120px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [cursor, handleLoadMore])

  const [deletingPk, setDeletingPk] = useState<string | null>(null)

  const handleDelete = useCallback(
    async (pkValue: string) => {
      if (!tableName || !pkColumn) return
      if (!window.confirm("이 행을 삭제하시겠습니까? 되돌릴 수 없습니다.")) return
      setDeletingPk(pkValue)
      const result = await deleteRow(tableName, pkColumn, pkValue)
      setDeletingPk(null)
      if (result.error) {
        handleError({
          timestamp: new Date().toLocaleString("ko-KR"),
          column: "(삭제)",
          pkValue,
          attempted: "",
          message: result.error,
        })
      } else {
        setRows((prev) => prev.filter((row) => String(row[pkColumn] ?? "") !== pkValue))
      }
    },
    [tableName, pkColumn, handleError],
  )

  const editable = !!tableName && !!pkColumn
  const bulkSelectable = editable && !!bulkDeleteEnabled
  const hasLinkColumn = !!rowLinks && !!pkColumn
  const hasExtraColumn = !!extraColumn && !!pkColumn
  // 링크 열을 끼워 넣을 위치 (지정 없으면 맨 뒤 = columns.length)
  const linkColumnIndex = rowLinks?.insertBeforeIndex ?? columns.length

  // ── 열 너비 드래그 조절: 테이블별로 localStorage에 저장해 새로고침/재방문 시에도 유지 ──
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  // 드래그 중인 열 key — 헤더/셀 강조 표시에 사용 (드래그당 시작/끝 2번만 바뀜, 매 픽셀마다 바뀌지 않음)
  const [resizingKey, setResizingKey] = useState<string | null>(null)
  const resizeState = useRef<{ key: string; startX: number; startWidth: number } | null>(null)
  const widthsLoadedRef = useRef(false)
  // table-layout:fixed + width:auto인 테이블은 브라우저가 <col> 너비 변경만으로는
  // 테이블 자체의 폭을 다시 계산해주지 않아, 드래그해도 실제 셀 너비가 그대로인 버그가 있었다.
  // 그래서 <table>과 각 <col>에 직접 접근해 드래그 중 실시간으로 픽셀 단위로 동기화한다.
  const tableElRef = useRef<HTMLTableElement>(null)
  const colElRefs = useRef<Record<string, HTMLTableColElement | null>>({})

  useEffect(() => {
    if (!tableName || widthsLoadedRef.current) return
    widthsLoadedRef.current = true
    try {
      const raw = localStorage.getItem(`col-widths:${tableName}`)
      if (raw) setColWidths(JSON.parse(raw))
    } catch {}
  }, [tableName])

  useEffect(() => {
    if (!tableName || Object.keys(colWidths).length === 0) return
    try {
      localStorage.setItem(`col-widths:${tableName}`, JSON.stringify(colWidths))
    } catch {}
  }, [colWidths, tableName])

  // 드래그 중 매 픽셀마다 React state를 갱신하면 전체 테이블(수백 행)이 매번 리렌더돼
  // 매우 느려지고 화면이 버벅였다. 이제 드래그 중에는 <col>/<table> DOM을 직접 조작해
  // 즉시 반영하고, state 커밋(및 localStorage 저장)은 마우스를 뗄 때 한 번만 한다.
  const applyLiveWidth = useCallback((key: string, next: number) => {
    const colEl = colElRefs.current[key]
    if (colEl) colEl.style.width = `${next}px`
    const tableEl = tableElRef.current
    if (tableEl) {
      let total = 0
      for (const el of Object.values(colElRefs.current)) {
        if (el) total += parseFloat(el.style.width || "0")
      }
      tableEl.style.width = `${total}px`
    }
  }, [])

  const handleResizeStart = useCallback(
    (key: string, defaultWidth: number, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startWidth = colWidths[key] ?? defaultWidth
      resizeState.current = { key, startX: e.clientX, startWidth }
      setResizingKey(key)

      const onMouseMove = (ev: MouseEvent) => {
        const state = resizeState.current
        if (!state) return
        const next = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, state.startWidth + (ev.clientX - state.startX)))
        applyLiveWidth(state.key, next)
      }
      const onMouseUp = (ev: MouseEvent) => {
        const state = resizeState.current
        resizeState.current = null
        setResizingKey(null)
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
        if (!state) return
        const next = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, state.startWidth + (ev.clientX - state.startX)))
        setColWidths((prev) => ({ ...prev, [state.key]: next }))
      }
      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [colWidths, applyLiveWidth],
  )

  const handleResizeReset = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setColWidths((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // 헤더 렌더링 순서와 동일하게 <colgroup>을 구성 (체크박스/링크/추가열/삭제 버튼 포함)
  type ColDef = { key: string; resizable: boolean; defaultWidth: number }
  const columnDefs: ColDef[] = []
  if (bulkSelectable) columnDefs.push({ key: "__select__", resizable: false, defaultWidth: 32 })
  columns.forEach((col, colIdx) => {
    if (hasLinkColumn && colIdx === linkColumnIndex) {
      columnDefs.push({ key: "__link__", resizable: true, defaultWidth: 96 })
    }
    columnDefs.push({ key: col, resizable: true, defaultWidth: DEFAULT_COL_WIDTH })
  })
  if (hasLinkColumn && linkColumnIndex >= columns.length) {
    columnDefs.push({ key: "__link__", resizable: true, defaultWidth: 96 })
  }
  if (hasExtraColumn) columnDefs.push({ key: "__extra__", resizable: true, defaultWidth: 140 })
  if (editable) columnDefs.push({ key: "__delete__", resizable: false, defaultWidth: 40 })

  // table-layout:fixed + width:auto인 <table>은 <col> 너비만 바꿔서는 테이블 자체 폭을
  // 다시 계산하지 않는 브라우저 동작 때문에, 합산 폭을 명시적으로 지정해줘야 리사이즈가 실제로 반영된다.
  const totalTableWidth = columnDefs.reduce((sum, def) => sum + (colWidths[def.key] ?? def.defaultWidth), 0)

  const [selectedPks, setSelectedPks] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const toggleSelect = useCallback((pkValue: string) => {
    setSelectedPks((prev) => {
      const next = new Set(prev)
      if (next.has(pkValue)) next.delete(pkValue)
      else next.add(pkValue)
      return next
    })
  }, [])

  const allSelected = bulkSelectable && rows.length > 0 && rows.every((row) => selectedPks.has(String(row[pkColumn!] ?? "")))

  const toggleSelectAll = useCallback(() => {
    if (!pkColumn) return
    setSelectedPks((prev) => {
      if (rows.length > 0 && rows.every((row) => prev.has(String(row[pkColumn] ?? "")))) return new Set()
      return new Set(rows.map((row) => String(row[pkColumn] ?? "")))
    })
  }, [rows, pkColumn])

  const handleBulkDelete = useCallback(async () => {
    if (!tableName || !pkColumn || selectedPks.size === 0) return
    if (!window.confirm(`선택한 ${selectedPks.size}개 행을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    setBulkDeleting(true)
    const pkValues = Array.from(selectedPks)
    const result = await deleteRows(tableName, pkColumn, pkValues)
    setBulkDeleting(false)
    if (result.error) {
      handleError({
        timestamp: new Date().toLocaleString("ko-KR"),
        column: "(일괄 삭제)",
        pkValue: pkValues.join(", "),
        attempted: "",
        message: result.error,
      })
    } else {
      setRows((prev) => prev.filter((row) => !selectedPks.has(String(row[pkColumn] ?? ""))))
      setSelectedPks(new Set())
    }
  }, [tableName, pkColumn, selectedPks, handleError])

  // 엑셀 추출: 현재 검색어/정렬 조건 그대로 전체 매칭 행을 다운로드
  const exportHref = (() => {
    if (!tableName) return null
    const params = new URLSearchParams()
    if (activeSort) params.set("sort", activeSort)
    if (activeDir) params.set("dir", activeDir)
    if (searchQuery) params.set("q", searchQuery)
    const qs = params.toString()
    return withBasePath(`/api/export/${encodeURIComponent(tableName)}${qs ? `?${qs}` : ""}`)
  })()

  // 레시피 링크 셀 (헤더 위치 계산과 무관하게 내용은 항상 동일)
  const renderLinkCell = (row: Record<string, unknown>, key: string) => {
    const href = rowLinks!.hrefByPk[String(row[pkColumn!] ?? "")]
    return (
      <TableCell key={key} className="align-top">
        {href ? (
          <Link
            href={href}
            title="레시피 작성 페이지에서 열기"
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-500/20"
          >
            <NotebookPen className="h-3 w-3 shrink-0" />
            레시피
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
    )
  }

  const extraColCount = (editable ? 1 : 0) + (bulkSelectable ? 1 : 0) + (hasLinkColumn ? 1 : 0) + (hasExtraColumn ? 1 : 0)

  const hasColumnVisibilityMenu = !!tableName && !!allColumns && allColumns.length > 0

  return (
    <div className="flex flex-col gap-3">
      {(searchEnabled || exportHref || hasColumnVisibilityMenu || categoryFilter || extraFilter) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {searchEnabled || categoryFilter || extraFilter ? (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {searchEnabled && (
                <form onSubmit={handleSearchSubmit} className="flex max-w-sm flex-1 items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder={searchPlaceholder ?? "검색"}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    검색
                  </button>
                </form>
              )}
              {extraFilter && (
                <SearchableSelect
                  className="w-40 shrink-0"
                  value={activeExtra}
                  onChange={handleExtraChange}
                  placeholder={extraFilter.placeholder ?? "전체"}
                  searchPlaceholder="검색..."
                  options={[
                    { value: "", label: extraFilter.placeholder ?? "전체" },
                    ...extraFilter.options,
                  ]}
                />
              )}
              {categoryFilter && (
                <SearchableSelect
                  className="w-56 shrink-0"
                  value={activeCategory}
                  onChange={handleCategoryChange}
                  placeholder={categoryFilter.placeholder ?? "전체 카테고리"}
                  searchPlaceholder={categoryFilter.searchPlaceholder ?? "카테고리 검색..."}
                  options={[
                    { value: "", label: categoryFilter.placeholder ?? "전체 카테고리" },
                    ...categoryFilter.options,
                  ]}
                />
              )}
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {hasColumnVisibilityMenu && (
              <ColumnSettingsMenu
                tableName={tableName!}
                allColumns={allColumns!}
                hiddenColumns={hiddenColumns ?? []}
              />
            )}
            {exportHref && (
              <a
                href={exportHref}
                title={searchQuery ? "현재 검색 결과 전체를 엑셀로 저장" : "전체 데이터를 엑셀로 저장"}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                엑셀 다운로드{searchQuery ? " (검색 결과)" : ""}
              </a>
            )}
          </div>
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            셀을 클릭하면 편집할 수 있습니다. Enter로 저장, Esc로 취소.
          </p>
          {bulkSelectable && selectedPks.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {bulkDeleting ? "삭제 중..." : `선택 삭제 (${selectedPks.size})`}
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table
          ref={tableElRef}
          containerClassName="max-h-[65vh] overflow-y-auto"
          className="table-fixed"
          style={{ width: totalTableWidth }}
        >
          <colgroup>
            {columnDefs.map((def) => (
              <col
                key={def.key}
                ref={(el) => {
                  colElRefs.current[def.key] = el
                }}
                style={{ width: colWidths[def.key] ?? def.defaultWidth }}
              />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              {bulkSelectable && (
                <TableHead className="sticky top-0 z-10 w-8 bg-card">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    title="전체 선택"
                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  />
                </TableHead>
              )}
              {columns.map((col, colIdx) => {
                const isSorted = activeSort === col
                const headCell = (
                  <TableHead
                    key={col}
                    onClick={() => handleSort(col)}
                    className={cn(
                      "sticky top-0 z-10 cursor-pointer select-none overflow-hidden whitespace-nowrap text-xs hover:bg-accent/60 relative transition-colors",
                      resizingKey === col ? "bg-primary/10" : "bg-card",
                    )}
                  >
                    <span className="inline-flex items-center gap-1 truncate">
                      {COLUMN_LABELS[col] ?? col}
                      {isSorted ? (
                        activeDir === "desc" ? (
                          <ArrowDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ArrowUp className="h-3 w-3 shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                      )}
                    </span>
                    {editable && col === pkColumn && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(PK)</span>
                    )}
                    <ResizeHandle
                      onMouseDown={(e) => handleResizeStart(col, DEFAULT_COL_WIDTH, e)}
                      onDoubleClick={(e) => handleResizeReset(col, e)}
                      isActive={resizingKey === col}
                    />
                  </TableHead>
                )
                if (hasLinkColumn && colIdx === linkColumnIndex) {
                  return (
                    <Fragment key={`link-wrap-${col}`}>
                      <TableHead
                        className={cn(
                          "sticky top-0 z-10 relative overflow-hidden whitespace-nowrap text-xs transition-colors",
                          resizingKey === "__link__" ? "bg-primary/10" : "bg-card",
                        )}
                      >
                        <span className="truncate">{rowLinks!.header}</span>
                        <ResizeHandle
                          onMouseDown={(e) => handleResizeStart("__link__", 96, e)}
                          onDoubleClick={(e) => handleResizeReset("__link__", e)}
                          isActive={resizingKey === "__link__"}
                        />
                      </TableHead>
                      {headCell}
                    </Fragment>
                  )
                }
                return headCell
              })}
              {hasLinkColumn && linkColumnIndex >= columns.length && (
                <TableHead
                  className={cn(
                    "sticky top-0 z-10 relative overflow-hidden whitespace-nowrap text-xs transition-colors",
                    resizingKey === "__link__" ? "bg-primary/10" : "bg-card",
                  )}
                >
                  <span className="truncate">{rowLinks!.header}</span>
                  <ResizeHandle
                    onMouseDown={(e) => handleResizeStart("__link__", 96, e)}
                    onDoubleClick={(e) => handleResizeReset("__link__", e)}
                    isActive={resizingKey === "__link__"}
                  />
                </TableHead>
              )}
              {hasExtraColumn && (
                <TableHead
                  className={cn(
                    "sticky top-0 z-10 relative overflow-hidden whitespace-nowrap text-xs transition-colors",
                    resizingKey === "__extra__" ? "bg-primary/10" : "bg-card",
                  )}
                >
                  <span className="truncate">{extraColumn!.header}</span>
                  <ResizeHandle
                    onMouseDown={(e) => handleResizeStart("__extra__", 140, e)}
                    onDoubleClick={(e) => handleResizeReset("__extra__", e)}
                    isActive={resizingKey === "__extra__"}
                  />
                </TableHead>
              )}
              {editable && (
                <TableHead className="sticky top-0 z-10 w-10 bg-card text-xs" />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + extraColCount} className="py-12 text-center text-sm text-muted-foreground">
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={i}>
                {bulkSelectable && (
                  <TableCell className="align-top">
                    <input
                      type="checkbox"
                      checked={selectedPks.has(String(row[pkColumn!] ?? ""))}
                      onChange={() => toggleSelect(String(row[pkColumn!] ?? ""))}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary"
                    />
                  </TableCell>
                )}
                {columns.map((col, colIdx) => {
                  const cell = (
                    <TableCell
                      key={col}
                      className={cn(
                        "overflow-hidden font-mono text-xs align-top transition-colors",
                        resizingKey === col && "bg-primary/5",
                      )}
                    >
                      {editable ? (
                        <EditableCell
                          col={col}
                          value={row[col]}
                          row={row}
                          tableName={tableName}
                          pkColumn={pkColumn}
                          columnOptions={columnOptions}
                          columnResolvers={columnResolvers}
                          columnMultiOptions={columnMultiOptions}
                          onRowUpdate={handleRowUpdate}
                          onError={handleError}
                        />
                      ) : (
                        <CellContent col={col} value={row[col]} row={row} columnResolvers={columnResolvers} tableName={tableName} />
                      )}
                    </TableCell>
                  )
                  if (hasLinkColumn && colIdx === linkColumnIndex) {
                    return (
                      <Fragment key={`link-wrap-${col}`}>
                        {renderLinkCell(row, `link-${col}`)}
                        {cell}
                      </Fragment>
                    )
                  }
                  return cell
                })}
                {hasLinkColumn && linkColumnIndex >= columns.length && renderLinkCell(row, "link-end")}
                {hasExtraColumn && (
                  <TableCell className="align-top">
                    {extraColumn!.cellsByPk[String(row[pkColumn!] ?? "")] ?? (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                )}
                {editable && (
                  <TableCell className="align-top">
                    {(() => {
                      const pkValue = String(row[pkColumn] ?? "")
                      const isDeleting = deletingPk === pkValue
                      return (
                        <button
                          onClick={() => handleDelete(pkValue)}
                          disabled={isDeleting}
                          title="삭제"
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )
                    })()}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {/* 커서 페이지네이션 센티널: 스크롤이 하단에 닿으면 다음 페이지 자동 로드 */}
            {cursor && (
              <tr>
                <td
                  colSpan={columns.length + extraColCount}
                  className="p-0"
                >
                  <div ref={sentinelRef} className="flex h-10 items-center justify-center text-xs text-muted-foreground">
                    {loadingMore ? "불러오는 중..." : ""}
                  </div>
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>

      {(cursor !== null || total !== undefined) && rows.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length.toLocaleString()}개 표시
            {total !== undefined && total !== null ? ` / 전체 ${total.toLocaleString()}개` : ""}
          </span>
          {cursor ? (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-md border border-input bg-background px-3 py-1.5 font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? "불러오는 중..." : "더 불러오기"}
            </button>
          ) : (
            total !== undefined && total !== null && rows.length >= total && <span>모두 불러왔습니다</span>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-destructive">에러 로그 ({errors.length})</p>
            <button
              onClick={() => setErrors([])}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              지우기
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {errors.map((err) => (
              <div key={err.id} className="rounded border border-destructive/20 bg-background p-2 font-mono text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                  <span>{err.timestamp}</span>
                  <span>
                    column: <span className="text-foreground">{err.column}</span>
                  </span>
                  <span>
                    pk: <span className="text-foreground">{err.pkValue}</span>
                  </span>
                  <span>
                    value: <span className="text-foreground">&quot;{err.attempted}&quot;</span>
                  </span>
                </div>
                <p className="mt-1 text-destructive">{err.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
