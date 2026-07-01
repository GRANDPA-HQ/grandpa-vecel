"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { saveSkuRecipe } from "@/app/actions/sku-recipe"
import { SearchableSelect } from "@/components/searchable-select"

type SelectOption = { value: string; label: string }

type RecipeRow = {
  localId: string
  prodId: string
  amount: string
  unit: "g" | "ml" | "ea"
  memo: string
}

export type InitialRecipe = {
  sku_id: string
  prod_id: string
  amount: number
  unit: string
  memo: string | null
}

type SkuTab = {
  localId: string
  skuId: string
  rows: RecipeRow[]
}

function createRow(): RecipeRow {
  return { localId: crypto.randomUUID(), prodId: "", amount: "", unit: "g", memo: "" }
}

function createTab(): SkuTab {
  return { localId: crypto.randomUUID(), skuId: "", rows: [createRow()] }
}

function toRows(recipes: InitialRecipe[]): RecipeRow[] {
  return recipes.map((r) => ({
    localId: crypto.randomUUID(),
    prodId: r.prod_id,
    amount: String(r.amount),
    unit: r.unit as "g" | "ml" | "ea",
    memo: r.memo ?? "",
  }))
}

export function SkuRecipeForm({
  skuOptions,
  prodOptions,
  initialRecipes,
}: {
  skuOptions: SelectOption[]
  prodOptions: SelectOption[]
  initialRecipes: InitialRecipe[]
}) {
  const [isPending, startTransition] = useTransition()
  const [tabs, setTabs] = useState<SkuTab[]>([createTab()])
  const [activeId, setActiveId] = useState<string>(() => tabs[0].localId)
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  function flash(type: "success" | "error", text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  const active = tabs.find((t) => t.localId === activeId)
  const usedSkuIds = new Set(tabs.map((t) => t.skuId).filter(Boolean))

  // ── 탭 조작 ──────────────────────────────────────────
  function addTab() {
    const tab = createTab()
    setTabs((prev) => [...prev, tab])
    setActiveId(tab.localId)
  }

  function removeTab(localId: string) {
    if (tabs.length === 1) return
    const remaining = tabs.filter((t) => t.localId !== localId)
    setTabs(remaining)
    if (activeId === localId) setActiveId(remaining[0].localId)
  }

  function handleSkuChange(skuId: string) {
    if (!active) return
    const existing = initialRecipes.filter((r) => r.sku_id === skuId)
    setTabs((prev) =>
      prev.map((t) =>
        t.localId !== active.localId
          ? t
          : { ...t, skuId, rows: existing.length > 0 ? toRows(existing) : [createRow()] },
      ),
    )
  }

  // ── 행 조작 ──────────────────────────────────────────
  function updateRow(rowId: string, field: keyof RecipeRow, value: string) {
    setTabs((prev) =>
      prev.map((t) =>
        t.localId !== activeId
          ? t
          : { ...t, rows: t.rows.map((r) => (r.localId === rowId ? { ...r, [field]: value } : r)) },
      ),
    )
  }

  function addRow() {
    setTabs((prev) =>
      prev.map((t) =>
        t.localId === activeId ? { ...t, rows: [...t.rows, createRow()] } : t,
      ),
    )
  }

  function removeRow(rowId: string) {
    setTabs((prev) =>
      prev.map((t) =>
        t.localId !== activeId || t.rows.length <= 1
          ? t
          : { ...t, rows: t.rows.filter((r) => r.localId !== rowId) },
      ),
    )
  }

  // ── 저장 (선택된 모든 탭) ──────────────────────────
  function handleSaveAll() {
    const toSave = tabs.filter((t) => t.skuId)
    if (toSave.length === 0) {
      flash("error", "저장할 SKU를 선택해주세요.")
      return
    }
    startTransition(async () => {
      const results = await Promise.all(
        toSave.map((t) => {
          const valid = t.rows.filter((r) => r.prodId && r.amount !== "")
          return saveSkuRecipe(
            t.skuId,
            valid.map((r) => ({
              prodId: r.prodId,
              amount: parseFloat(r.amount),
              unit: r.unit,
              memo: r.memo,
            })),
          )
        }),
      )
      const firstError = results.find((r) => r.error)?.error
      if (firstError) flash("error", firstError)
      else flash("success", `${toSave.length}개 SKU 레시피가 저장됐습니다.`)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── 탭 바 ── */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((t) => {
          const sku = skuOptions.find((o) => o.value === t.skuId)
          return (
            <div key={t.localId} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => setActiveId(t.localId)}
                className={cn(
                  "flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  t.localId === activeId
                    ? "border-indigo-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {sku ? sku.label : "SKU 미선택"}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTab(t.localId)}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-red-100 hover:text-red-600 group-hover:flex"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          )
        })}

        <button
          type="button"
          onClick={addTab}
          className="ml-1 flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          SKU 추가
        </button>
      </div>

      {/* ── 활성 탭 콘텐츠 ── */}
      {active && (
        <>
          {/* SKU 선택 */}
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">SKU 선택</span>
            <SearchableSelect
              className="w-72"
              value={active.skuId}
              onChange={handleSkuChange}
              placeholder="— SKU를 선택하세요 —"
              searchPlaceholder="SKU 검색..."
              options={skuOptions.map((opt) => ({
                value: opt.value,
                label:
                  opt.label + (usedSkuIds.has(opt.value) && opt.value !== active.skuId ? " (이미 추가됨)" : ""),
                disabled: usedSkuIds.has(opt.value) && opt.value !== active.skuId,
              }))}
            />
            {active.skuId && (
              <span className="text-xs text-muted-foreground">
                {initialRecipes.some((r) => r.sku_id === active.skuId)
                  ? "기존 레시피 불러옴"
                  : "새 레시피"}
              </span>
            )}
          </div>

          {/* 레시피 행 테이블 */}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 px-4 py-3 text-center">#</th>
                  <th className="px-4 py-3">생산품</th>
                  <th className="w-32 px-4 py-3">수량</th>
                  <th className="w-24 px-4 py-3">단위</th>
                  <th className="px-4 py-3">메모</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.rows.map((row, idx) => (
                  <tr key={row.localId} className="group transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-600">
                        {idx + 1}
                      </span>
                    </td>

                    <td className="px-4 py-2">
                      <SearchableSelect
                        value={row.prodId}
                        onChange={(v) => updateRow(row.localId, "prodId", v)}
                        placeholder="— 선택 —"
                        searchPlaceholder="생산품 검색..."
                        options={prodOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                      />
                    </td>

                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={row.amount}
                        onChange={(e) => updateRow(row.localId, "amount", e.target.value)}
                        placeholder="0"
                        className="h-8 border-none bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-indigo-500/40"
                      />
                    </td>

                    <td className="px-4 py-2">
                      <select
                        value={row.unit}
                        onChange={(e) => updateRow(row.localId, "unit", e.target.value)}
                        className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="ea">ea</option>
                      </select>
                    </td>

                    <td className="px-4 py-2">
                      <Input
                        value={row.memo}
                        onChange={(e) => updateRow(row.localId, "memo", e.target.value)}
                        placeholder="메모 입력"
                        className="h-8 border-none bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-indigo-500/40"
                      />
                    </td>

                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row.localId)}
                        disabled={active.rows.length <= 1}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-border bg-muted/20">
              <button
                type="button"
                onClick={addRow}
                className="flex w-full items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                생산품 추가
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── 하단 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{tabs.filter((t) => t.skuId).length}</span>
            개 SKU 편집 중 ·{" "}
            <span className="font-semibold text-foreground">{active?.rows.length ?? 0}</span>
            개 생산품
          </p>
          {msg && (
            <span
              className={cn(
                "text-xs font-medium",
                msg.type === "success" ? "text-emerald-600" : "text-red-600",
              )}
            >
              {msg.text}
            </span>
          )}
        </div>
        <Button onClick={handleSaveAll} disabled={isPending} size="sm" className="gap-2">
          <Save className="h-3.5 w-3.5" />
          {isPending ? "저장 중..." : "전체 저장"}
        </Button>
      </div>
    </div>
  )
}
