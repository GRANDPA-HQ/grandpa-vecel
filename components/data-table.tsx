"use client"

import Image from "next/image"
import { useState, useRef, useCallback } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { updateRow } from "@/app/actions/table-edit"
import { COLUMN_LABELS } from "@/lib/column-labels"

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp"]

type SelectOption = { value: string; label: string }

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
  "tb_prod_mst.storage": [
    { value: "냉장", label: "냉장", className: "bg-blue-100 text-blue-700 border-blue-200" },
    { value: "냉동", label: "냉동", className: "bg-sky-100 text-sky-700 border-sky-200" },
    { value: "상온", label: "상온", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ],
}

const CODE_RE = /^(?:RAW|PROD)-([A-Z][A-Z0-9_]*)-(\d+)$/i

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
  const match = code.match(CODE_RE)
  if (!match) return null
  const category = match[1].toUpperCase()
  const num = match[2]
  return `/api/images/${category}/${category}-${num}.${IMAGE_EXTS[extIdx]}`
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

// 이미지를 표시하지 않을 컬럼 목록
const NO_IMAGE_COLS = new Set(["raw_code", "prod_code"])

function CellContent({
  col,
  value,
  row,
  columnResolvers,
}: {
  col: string
  value: unknown
  row: Record<string, unknown>
  columnResolvers?: Record<string, Record<string, string>>
}) {
  if (col === "photo") return <PhotoCell row={row} />
  // 배열 값 처리 (Postgres array / JSONB array)
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">-</span>
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{String(v)}</span>
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
            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{v}</span>
          ))}
        </div>
      )
  }
  const resolved = columnResolvers?.[col]?.[text]
  if (resolved !== undefined)
    return <span title={text}>{resolved}</span>
  if (!NO_IMAGE_COLS.has(col) && CODE_RE.test(text)) return <CodeImageCell code={text.toUpperCase()} />
  if (text.length > 20)
    return <span title={text} className="whitespace-pre-wrap break-all">{text}</span>
  return <span title={text}>{text}</span>
}

type ErrorEntry = {
  id: number
  timestamp: string
  column: string
  pkValue: string
  attempted: string
  message: string
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
  columnMultiOptions?: Record<string, string[]>
  onRowUpdate: (pkValue: string, col: string, newValue: unknown) => void
  onError: (e: Omit<ErrorEntry, "id">) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editStr, setEditStr] = useState("")
  const [saving, setSaving] = useState(false)
  const escapeRef = useRef(false)

  const pkValue = String(row[pkColumn] ?? "")
  const canEdit = col !== pkColumn && col !== "photo"
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
    return <CellContent col={col} value={value} row={row} columnResolvers={columnResolvers} />
  }

  // ── 다중 선택 체크박스 편집 모드 ──
  if (editing && multiOpts) {
    const selected = parseMultiValue(editStr)
    return (
      <div className="flex flex-col gap-1 rounded border border-ring bg-background p-2 shadow-md">
        {multiOpts.map((opt) => (
          <label key={opt} className="flex cursor-pointer select-none items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, opt]
                  : selected.filter((v) => v !== opt)
                setEditStr(JSON.stringify(next))
              }}
              className="h-3.5 w-3.5 accent-primary"
            />
            {opt}
          </label>
        ))}
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
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  // ── 일반 텍스트 편집 모드 ──
  if (editing) {
    return (
      <input
        value={editStr}
        onChange={(e) => setEditStr(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            handleSave()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            escapeRef.current = true
            setEditing(false)
          }
        }}
        className="w-full min-w-[80px] rounded border border-ring bg-background px-1 py-0.5 font-mono text-xs outline-none ring-1 ring-ring"
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
        <CellContent col={col} value={value} row={row} columnResolvers={columnResolvers} />
      )}
    </div>
  )
}

export function DataTable({
  columns,
  rows: initialRows,
  tableName,
  pkColumn,
  columnOptions,
  columnResolvers,
  columnMultiOptions,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  tableName?: string
  pkColumn?: string | null
  columnOptions?: Record<string, SelectOption[]>
  columnResolvers?: Record<string, Record<string, string>>
  columnMultiOptions?: Record<string, string[]>
}) {
  const [rows, setRows] = useState(initialRows)
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const errorCounter = useRef(0)

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

  const editable = !!tableName && !!pkColumn

  return (
    <div className="flex flex-col gap-3">
      {editable && (
        <p className="text-xs text-muted-foreground">
          셀을 클릭하면 편집할 수 있습니다. Enter로 저장, Esc로 취소.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap text-xs">
                  {COLUMN_LABELS[col] ?? col}
                  {editable && col === pkColumn && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(PK)</span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-12 text-center text-sm text-muted-foreground">
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col} className="max-w-[20ch] font-mono text-xs align-top">
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
                      <CellContent col={col} value={row[col]} row={row} columnResolvers={columnResolvers} />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
