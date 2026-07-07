"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { insertRow, fetchNextSkuCode, fetchNextRawCode, fetchNextProdCode } from "@/app/actions/table-edit"
import { COLUMN_LABELS } from "@/lib/column-labels"

// 테이블별 카테고리 선택 시 코드를 자동 채워주는 설정
const AUTO_CODE_CONFIG: Record<string, { column: string; fetchCode: (categoryCode: string) => Promise<string> }> = {
  tb_sku_mst:  { column: "sku_code",  fetchCode: fetchNextSkuCode },
  tb_raw_mst:  { column: "raw_code",  fetchCode: fetchNextRawCode },
  tb_prod_mst: { column: "prod_code", fetchCode: fetchNextProdCode },
}

export type ColumnDef = {
  name: string
  type: string
  format: string
  required: boolean
}

type SelectOption = { value: string; label: string }
type MultiOption = string | SelectOption

function toSelectOption(opt: MultiOption): SelectOption {
  return typeof opt === "string" ? { value: opt, label: opt } : opt
}

function parseMultiValue(val: string | undefined): string[] {
  if (!val) return []
  try {
    const p = JSON.parse(val)
    if (Array.isArray(p)) return p.map(String)
  } catch {}
  if (val.startsWith("{") && val.endsWith("}"))
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, ""))
  return []
}

function getInputType(col: ColumnDef): "number" | "text" {
  if (col.type === "integer" || col.type === "number") return "number"
  return "text"
}

export function AddRowDialog({
  tableName,
  columns,
  columnOptions,
  columnMultiOptions,
  fieldOrder,
}: {
  tableName: string
  columns: ColumnDef[]
  columnOptions?: Record<string, SelectOption[]>
  columnMultiOptions?: Record<string, MultiOption[]>
  fieldOrder?: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const lastAutoCode = useRef<string | null>(null)

  const orderedColumns = fieldOrder
    ? [
        ...fieldOrder
          .map((name) => columns.find((c) => c.name === name))
          .filter((c): c is ColumnDef => !!c),
        ...columns.filter((c) => !fieldOrder.includes(c.name)),
      ]
    : columns

  // 카테고리 선택 시 해당 카테고리의 다음 코드(sku_code / raw_code / prod_code)를 자동 채움
  const autoCodeConfig = AUTO_CODE_CONFIG[tableName]
  const categoryValue = values["category_code"]
  useEffect(() => {
    if (!autoCodeConfig || !categoryValue) return
    const codeColumn = autoCodeConfig.column
    const currentCode = values[codeColumn] ?? ""
    if (currentCode !== "" && currentCode !== lastAutoCode.current) return
    let cancelled = false
    autoCodeConfig.fetchCode(categoryValue).then((code) => {
      if (cancelled) return
      lastAutoCode.current = code
      setValues((v) => ({ ...v, [codeColumn]: code }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, categoryValue])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = "hidden"
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", handleEsc)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleEsc)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleOpen() {
    setValues({})
    setError(null)
    lastAutoCode.current = null
    setOpen(true)
  }

  function handleClose() {
    if (isPending) return
    setOpen(false)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const columnTypes: Record<string, string> = {}
    for (const col of columns) {
      columnTypes[col.name] = col.type
    }
    startTransition(async () => {
      const result = await insertRow(tableName, values, columnTypes)
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button onClick={handleOpen} size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        데이터 추가
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
          <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-background shadow-xl">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-mono text-base font-semibold">{tableName}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">새 데이터를 입력하세요</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
              <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
                {columns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">컬럼 정보를 불러올 수 없습니다.</p>
                ) : (
                  orderedColumns.map((col) => {
                    const multiOpts = columnMultiOptions?.[col.name]
                    const singleOpts = columnOptions?.[col.name]
                    const selected = parseMultiValue(values[col.name])
                    const isAutoCode = autoCodeConfig?.column === col.name

                    return (
                      <div key={col.name} className="flex flex-col gap-1.5">
                        <Label htmlFor={`field-${col.name}`} className="text-xs font-medium">
                          {COLUMN_LABELS[col.name] ?? col.name}
                          {col.required && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                          <span className="ml-1.5 font-normal text-muted-foreground font-mono">
                            ({col.name})
                          </span>
                          {isAutoCode && (
                            <span className="ml-1.5 font-normal text-muted-foreground">
                              — 카테고리 선택 시 자동 채워짐
                            </span>
                          )}
                        </Label>

                        {multiOpts ? (
                          // ── 다중 선택 체크박스 ──
                          <div className="flex flex-col gap-1 rounded-md border border-input bg-background px-3 py-2">
                            {multiOpts.map((rawOpt) => {
                              const opt = toSelectOption(rawOpt)
                              return (
                                <label
                                  key={opt.value}
                                  className="flex cursor-pointer select-none items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...selected, opt.value]
                                        : selected.filter((v) => v !== opt.value)
                                      setValues((v) => ({
                                        ...v,
                                        [col.name]: JSON.stringify(next),
                                      }))
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                                  />
                                  {opt.label}
                                </label>
                              )
                            })}
                            {selected.length > 0 && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                선택됨: {selected
                                  .map((v) => toSelectOption(multiOpts.find((o) => toSelectOption(o).value === v) ?? v).label)
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                        ) : singleOpts ? (
                          // ── 단일 선택 드롭박스 ──
                          <select
                            id={`field-${col.name}`}
                            value={values[col.name] ?? ""}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [col.name]: e.target.value }))
                            }
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">— 선택 —</option>
                            {singleOpts.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : col.type === "boolean" ? (
                          <select
                            id={`field-${col.name}`}
                            value={values[col.name] ?? ""}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [col.name]: e.target.value }))
                            }
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">선택 안 함 (null)</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <Input
                            id={`field-${col.name}`}
                            type={getInputType(col)}
                            value={values[col.name] ?? ""}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [col.name]: e.target.value }))
                            }
                            placeholder={`${col.name} 입력`}
                            step={col.type === "number" ? "any" : undefined}
                          />
                        )}
                      </div>
                    )
                  })
                )}

                {error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                  취소
                </Button>
                <Button type="submit" disabled={isPending || columns.length === 0}>
                  {isPending ? "저장 중..." : "추가"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
