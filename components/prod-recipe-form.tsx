"use client"

import { useState, useTransition, useEffect, useMemo } from "react"
import { Plus, Trash2, Save, X, Search, GripVertical, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { saveProdRecipe } from "@/app/actions/prod-recipe"
import { SearchableSelect } from "@/components/searchable-select"

type SelectOption = { value: string; label: string }

type RecipeRow = {
  localId: string
  rawId: string
  amount: string
  unit: "g" | "ml" | "ea"
  memo: string
}

export type InitialProdRecipe = {
  prod_id: string
  raw_id: string
  amount: number
  unit: string
  memo: string | null
}

// 원자재 100g 기준 영양성분 (null = 미등록)
export type RawNutrition = {
  kcal: number | null
  carb: number | null
  protein: number | null
  fat: number | null
}

type ProdTab = {
  localId: string
  prodId: string
  rows: RecipeRow[]
}

// 작성 중인 내용을 브라우저(localStorage)에 자동 임시저장하는 키
const DRAFT_KEY = "prod-recipe-draft-v1"

type Draft = { tabs: ProdTab[]; activeId: string }

function hasDraftContent(tabs: ProdTab[]): boolean {
  return tabs.some(
    (t) => t.prodId || t.rows.some((r) => r.rawId || r.amount !== "" || r.memo !== ""),
  )
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    if (
      !Array.isArray(draft.tabs) ||
      draft.tabs.length === 0 ||
      !draft.tabs.every((t) => typeof t.localId === "string" && Array.isArray(t.rows))
    )
      return null
    if (!hasDraftContent(draft.tabs)) return null
    return draft
  } catch {
    return null
  }
}

function createRow(): RecipeRow {
  return { localId: crypto.randomUUID(), rawId: "", amount: "", unit: "g", memo: "" }
}

function createTab(): ProdTab {
  return { localId: crypto.randomUUID(), prodId: "", rows: [createRow()] }
}

function toRows(recipes: InitialProdRecipe[]): RecipeRow[] {
  return recipes.map((r) => ({
    localId: crypto.randomUUID(),
    rawId: r.raw_id,
    amount: String(r.amount),
    unit: r.unit as "g" | "ml" | "ea",
    memo: r.memo ?? "",
  }))
}

// 숫자 표시: 소수 1자리까지, 불필요한 .0 제거 (예: 1234.5 → "1,234.5", 120 → "120")
function fmt(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 1 })
}

export function ProdRecipeForm({
  prodOptions,
  rawOptions,
  rawNutritionById,
  initialRecipes,
}: {
  prodOptions: SelectOption[]
  rawOptions: SelectOption[]
  rawNutritionById: Record<string, RawNutrition>
  initialRecipes: InitialProdRecipe[]
}) {
  const [isPending, startTransition] = useTransition()
  const [tabs, setTabs] = useState<ProdTab[]>([createTab()])
  const [activeId, setActiveId] = useState<string>(() => tabs[0].localId)
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [tabQuery, setTabQuery] = useState("")
  const [dragId, setDragId] = useState<string | null>(null)
  // 행 드래그 순서 변경: armed = 핸들을 누른 행만 draggable로 만들어 입력 필드 조작과 충돌 방지
  const [rowDragId, setRowDragId] = useState<string | null>(null)
  const [rowDragArmed, setRowDragArmed] = useState<string | null>(null)
  const [draftReady, setDraftReady] = useState(false)

  function flash(type: "success" | "error", text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  // 마운트 시 임시저장된 초안이 있으면 복원 (SSR 하이드레이션 이후에 실행)
  useEffect(() => {
    const draft = loadDraft()
    if (draft) {
      setTabs(draft.tabs)
      setActiveId(
        draft.tabs.some((t) => t.localId === draft.activeId) ? draft.activeId : draft.tabs[0].localId,
      )
      flash("success", "임시저장된 작성 내용을 불러왔습니다.")
    }
    setDraftReady(true)
  }, [])

  // 작성 내용이 바뀔 때마다 자동 임시저장 (내용이 비면 초안 삭제)
  useEffect(() => {
    if (!draftReady) return
    try {
      if (hasDraftContent(tabs)) localStorage.setItem(DRAFT_KEY, JSON.stringify({ tabs, activeId }))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {}
  }, [tabs, activeId, draftReady])

  const active = tabs.find((t) => t.localId === activeId)
  const usedProdIds = new Set(tabs.map((t) => t.prodId).filter(Boolean))

  // ── 영양성분 합계 (활성 탭) ──────────────────────────
  // g/ml 단위 행만 합산 (ml은 1g≈1ml로 근사). ea 단위·영양정보 미등록 원자재는 제외하고 건수 표시.
  const nutrition = useMemo(() => {
    let grams = 0
    let kcal = 0
    let carb = 0
    let protein = 0
    let fat = 0
    let counted = 0
    let eaExcluded = 0
    let noDataExcluded = 0

    for (const row of active?.rows ?? []) {
      const amount = parseFloat(row.amount)
      if (!row.rawId || !Number.isFinite(amount) || amount <= 0) continue
      if (row.unit === "ea") {
        eaExcluded++
        continue
      }
      const n = rawNutritionById[row.rawId]
      const hasData =
        n && (n.kcal !== null || n.carb !== null || n.protein !== null || n.fat !== null)
      grams += amount
      if (!hasData) {
        noDataExcluded++
        continue
      }
      const factor = amount / 100
      kcal += (n.kcal ?? 0) * factor
      carb += (n.carb ?? 0) * factor
      protein += (n.protein ?? 0) * factor
      fat += (n.fat ?? 0) * factor
      counted++
    }

    return { grams, kcal, carb, protein, fat, counted, eaExcluded, noDataExcluded }
  }, [active, rawNutritionById])

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

  function tabLabel(t: ProdTab) {
    const prod = prodOptions.find((o) => o.value === t.prodId)
    return prod ? prod.label : "생산품 미선택"
  }

  function moveTab(fromId: string, toId: string) {
    if (fromId === toId) return
    setTabs((prev) => {
      const fromIdx = prev.findIndex((t) => t.localId === fromId)
      const toIdx = prev.findIndex((t) => t.localId === toId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  function handleProdChange(prodId: string) {
    if (!active) return
    const existing = initialRecipes.filter((r) => r.prod_id === prodId)
    setTabs((prev) =>
      prev.map((t) =>
        t.localId !== active.localId
          ? t
          : { ...t, prodId, rows: existing.length > 0 ? toRows(existing) : [createRow()] },
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

  function moveRow(fromId: string, toId: string) {
    if (fromId === toId) return
    setTabs((prev) =>
      prev.map((t) => {
        if (t.localId !== activeId) return t
        const fromIdx = t.rows.findIndex((r) => r.localId === fromId)
        const toIdx = t.rows.findIndex((r) => r.localId === toId)
        if (fromIdx === -1 || toIdx === -1) return t
        const rows = [...t.rows]
        const [moved] = rows.splice(fromIdx, 1)
        rows.splice(toIdx, 0, moved)
        return { ...t, rows }
      }),
    )
  }

  // 핸들을 누른 채 드래그하지 않고 놓았을 때 armed 상태가 남지 않도록 정리
  useEffect(() => {
    if (!rowDragArmed) return
    const clear = () => setRowDragArmed(null)
    window.addEventListener("mouseup", clear)
    return () => window.removeEventListener("mouseup", clear)
  }, [rowDragArmed])

  // 행별 열량 미리보기 (g/ml 단위 + 영양정보 있는 원자재만)
  function rowKcal(row: RecipeRow): number | null {
    const amount = parseFloat(row.amount)
    if (!row.rawId || !Number.isFinite(amount) || amount <= 0 || row.unit === "ea") return null
    const n = rawNutritionById[row.rawId]
    if (!n || n.kcal === null) return null
    return (n.kcal * amount) / 100
  }

  // ── 저장 (선택된 모든 탭) ──────────────────────────
  function handleSaveAll() {
    const toSave = tabs.filter((t) => t.prodId)
    if (toSave.length === 0) {
      flash("error", "저장할 생산품을 선택해주세요.")
      return
    }
    startTransition(async () => {
      const results = await Promise.all(
        toSave.map((t) => {
          const valid = t.rows.filter((r) => r.rawId && r.amount !== "")
          return saveProdRecipe(
            t.prodId,
            valid.map((r) => ({
              rawId: r.rawId,
              amount: parseFloat(r.amount),
              unit: r.unit,
              memo: r.memo,
            })),
          )
        }),
      )
      const firstError = results.find((r) => r.error)?.error
      if (firstError) flash("error", firstError)
      else {
        // 정식 저장이 완료됐으므로 임시저장 초안은 삭제
        try {
          localStorage.removeItem(DRAFT_KEY)
        } catch {}
        flash("success", `${toSave.length}개 생산품 레시피가 저장됐습니다.`)
      }
    })
  }

  const dragEnabled = !tabQuery.trim()
  // 띄어쓰기 무시 검색 (예: "양파볶음"으로 "양파 볶음" 탭 검색 가능)
  const normalizeQuery = (s: string) => s.replace(/\s+/g, "").toLowerCase()
  const normalizedTabQuery = normalizeQuery(tabQuery)
  const visibleTabs = normalizedTabQuery
    ? tabs.filter(
        (t) => t.localId === activeId || normalizeQuery(tabLabel(t)).includes(normalizedTabQuery),
      )
    : tabs

  return (
    <div className="flex flex-col gap-5">
      {/* ── 탭 바 ── */}
      <div className="flex flex-col gap-2">
        {tabs.length > 3 && (
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={tabQuery}
              onChange={(e) => setTabQuery(e.target.value)}
              placeholder="탭 검색 (생산품 코드/이름)"
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
          {visibleTabs.map((t) => (
            <div
              key={t.localId}
              draggable={dragEnabled}
              onDragStart={(e) => {
                setDragId(t.localId)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => {
                if (dragEnabled) e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) moveTab(dragId, t.localId)
                setDragId(null)
              }}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "group relative flex items-center",
                dragEnabled && "cursor-grab active:cursor-grabbing",
                dragId === t.localId && "opacity-40",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveId(t.localId)}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  t.localId === activeId
                    ? "border-indigo-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {dragEnabled && (
                  <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                )}
                {tabLabel(t)}
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
          ))}

          <button
            type="button"
            onClick={addTab}
            className="ml-1 flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            생산품 추가
          </button>
        </div>
      </div>

      {/* ── 활성 탭 콘텐츠 ── */}
      {active && (
        <>
          {/* 생산품 선택 */}
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">생산품 선택</span>
            <SearchableSelect
              className="w-72"
              value={active.prodId}
              onChange={handleProdChange}
              placeholder="— 생산품을 선택하세요 —"
              searchPlaceholder="생산품 검색..."
              options={prodOptions.map((opt) => ({
                value: opt.value,
                label:
                  opt.label + (usedProdIds.has(opt.value) && opt.value !== active.prodId ? " (이미 추가됨)" : ""),
                disabled: usedProdIds.has(opt.value) && opt.value !== active.prodId,
              }))}
            />
            {active.prodId && (
              <span className="text-xs text-muted-foreground">
                {initialRecipes.some((r) => r.prod_id === active.prodId)
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
                  <th className="w-16 px-4 py-3 text-center">#</th>
                  <th className="px-4 py-3">원자재</th>
                  <th className="w-32 px-4 py-3">수량</th>
                  <th className="w-24 px-4 py-3">단위</th>
                  <th className="w-24 px-4 py-3 text-right">열량</th>
                  <th className="px-4 py-3">메모</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.rows.map((row, idx) => {
                  const kcal = rowKcal(row)
                  return (
                    <tr
                      key={row.localId}
                      draggable={rowDragArmed === row.localId}
                      onDragStart={(e) => {
                        setRowDragId(row.localId)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onDragOver={(e) => {
                        if (rowDragId) e.preventDefault()
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (rowDragId) moveRow(rowDragId, row.localId)
                        setRowDragId(null)
                        setRowDragArmed(null)
                      }}
                      onDragEnd={() => {
                        setRowDragId(null)
                        setRowDragArmed(null)
                      }}
                      className={cn(
                        "group transition-colors hover:bg-muted/30",
                        rowDragId === row.localId && "opacity-40",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onMouseDown={() => setRowDragArmed(row.localId)}
                            title="드래그하여 순서 변경"
                            className="cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-600">
                            {idx + 1}
                          </span>
                        </span>
                      </td>

                      <td className="px-4 py-2">
                        <SearchableSelect
                          value={row.rawId}
                          onChange={(v) => updateRow(row.localId, "rawId", v)}
                          placeholder="— 선택 —"
                          searchPlaceholder="원자재 검색..."
                          options={rawOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
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

                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {kcal !== null ? `${fmt(kcal)} kcal` : "-"}
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
                  )
                })}
              </tbody>
            </table>

            <div className="border-t border-border bg-muted/20">
              <button
                type="button"
                onClick={addRow}
                className="flex w-full items-center justify-center gap-1.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                원자재 추가
              </button>
            </div>
          </div>

          {/* ── 영양성분 합계 (원자재 100g 기준 영양정보 × 투입량으로 자동 계산) ── */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold">영양성분 합계</h2>
              <span className="text-xs text-muted-foreground">
                원자재 100g 기준 영양정보 × 투입량 자동 계산 (ml은 1g으로 근사)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { label: "총 중량", value: `${fmt(nutrition.grams)} g` },
                { label: "열량", value: `${fmt(nutrition.kcal)} kcal`, highlight: true },
                { label: "탄수화물", value: `${fmt(nutrition.carb)} g` },
                { label: "단백질", value: `${fmt(nutrition.protein)} g` },
                { label: "지방", value: `${fmt(nutrition.fat)} g` },
              ].map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    "rounded-lg border bg-background px-3 py-2.5",
                    item.highlight ? "border-orange-200" : "border-border",
                  )}
                >
                  <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
                  <p
                    className={cn(
                      "mt-0.5 font-mono text-base font-semibold tabular-nums",
                      item.highlight && "text-orange-600",
                    )}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {(nutrition.eaExcluded > 0 || nutrition.noDataExcluded > 0) && (
              <p className="mt-2 text-xs text-amber-600">
                {nutrition.eaExcluded > 0 && `ea 단위 ${nutrition.eaExcluded}건은 중량을 알 수 없어 합계에서 제외됐습니다.`}
                {nutrition.eaExcluded > 0 && nutrition.noDataExcluded > 0 && " "}
                {nutrition.noDataExcluded > 0 && `영양정보 미등록 원자재 ${nutrition.noDataExcluded}건은 중량만 합산됐습니다.`}
              </p>
            )}
          </div>
        </>
      )}

      {/* ── 하단 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{tabs.filter((t) => t.prodId).length}</span>
            개 생산품 편집 중 ·{" "}
            <span className="font-semibold text-foreground">{active?.rows.length ?? 0}</span>
            개 원자재 · 작성 내용은 이 기기에 자동 임시저장됩니다
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
