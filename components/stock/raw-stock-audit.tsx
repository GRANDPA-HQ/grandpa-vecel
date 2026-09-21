"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Plus, X } from "lucide-react"
import { submitRawAudit, type AuditWasteEntry } from "@/app/actions/raw-stock"
import { formatRawQty, WASTE_REASON_OPTIONS, reasonMemoRequired, STORAGE_OPTIONS, type WasteReasonCode } from "@/lib/raw-stock"
import { cn } from "@/lib/utils"
import type { RawCategoryInfo } from "@/lib/supabase/db"

export type AuditItem = {
  rawCode: string
  rawName: string
  categoryCode: string | null
  storage: string | null
  countSize: number | null
  countUnit: string | null
  systemStock: number
}

type WasteDraft = { mode: "count" | "weight"; value: string; reasonCode: WasteReasonCode; reasonMemo: string }
type ItemState = { countedUnits: string; wasteEntries: WasteDraft[]; confirmed: boolean }

export function RawStockAudit({ items, categories }: { items: AuditItem[]; categories: RawCategoryInfo[] }) {
  const router = useRouter()
  const [curCat, setCurCat] = useState<string>("ALL")
  const [curStorage, setCurStorage] = useState<string>("ALL")
  const [openId, setOpenId] = useState<string | null>(null)
  const [state, setState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(items.map((it) => [it.rawCode, { countedUnits: "", wasteEntries: [], confirmed: false }])),
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(
    () => items.filter((i) => (curCat === "ALL" || i.categoryCode === curCat) && (curStorage === "ALL" || i.storage === curStorage)),
    [items, curCat, curStorage],
  )

  const doneCount = filtered.filter((i) => state[i.rawCode]?.confirmed).length

  function updateItem(rawCode: string, patch: Partial<ItemState>) {
    setState((prev) => ({ ...prev, [rawCode]: { ...prev[rawCode], ...patch, confirmed: false } }))
  }

  function confirmItem(item: AuditItem) {
    const s = state[item.rawCode]
    const countedUnits = Number(s.countedUnits)
    if (s.countedUnits === "" || Number.isNaN(countedUnits) || countedUnits < 0) return
    for (const w of s.wasteEntries) {
      const v = Number(w.value)
      if (!v || v <= 0) return
      if (reasonMemoRequired(w.reasonCode) && !w.reasonMemo.trim()) return
    }

    setError(null)
    startTransition(async () => {
      const wasteEntries: AuditWasteEntry[] = s.wasteEntries.map((w) => ({
        mode: w.mode,
        value: Number(w.value),
        reasonCode: w.reasonCode,
        reasonMemo: w.reasonMemo || undefined,
      }))
      const result = await submitRawAudit(item.rawCode, countedUnits, wasteEntries)
      if (result.error) {
        setError(result.error)
        return
      }
      setState((prev) => ({ ...prev, [item.rawCode]: { ...prev[item.rawCode], confirmed: true } }))
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div>
        <h1 className="text-lg font-extrabold">재고 실사</h1>
        <p className="text-xs text-muted-foreground">원재료 · 미개봉 개수 기준 · 보관영역 구분 없음(보관방식·카테고리로 범위를 좁혀 셉니다)</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip on={curStorage === "ALL"} onClick={() => setCurStorage("ALL")}>
          보관방식 전체
        </Chip>
        {STORAGE_OPTIONS.map((s) => (
          <Chip key={s} on={curStorage === s} onClick={() => setCurStorage(s)}>
            {s}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip on={curCat === "ALL"} onClick={() => setCurCat("ALL")}>
          전체 <span className="opacity-60">{items.length}</span>
        </Chip>
        {categories.map((c) => {
          const n = items.filter((i) => i.categoryCode === c.code).length
          if (n === 0) return null
          return (
            <Chip key={c.code} on={curCat === c.code} onClick={() => setCurCat(c.code)}>
              <span>{c.emoji}</span> {c.name} <span className="opacity-60">{n}</span>
            </Chip>
          )
        })}
      </div>

      <div className="rounded-lg bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
        <b>미개봉 개수만</b> 세어 입력하세요. 개봉해 쓰고 있는 것은 세지 않습니다.
        <br />
        상한 게 있으면 <b>먼저 폐기부터</b> 추가한 뒤 미개봉 개수를 입력하세요 — 나머지는 시스템이 자동으로 맞춰줍니다.
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-bold">
        <span>표시된 품목 {filtered.length}종</span>
        <span className="text-emerald-700">{doneCount}개 확정됨</span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">해당하는 품목이 없습니다.</p>
        ) : (
          filtered.map((item) => (
            <AuditItemCard
              key={item.rawCode}
              item={item}
              open={openId === item.rawCode}
              onToggle={() => setOpenId(openId === item.rawCode ? null : item.rawCode)}
              state={state[item.rawCode]}
              onChange={(patch) => updateItem(item.rawCode, patch)}
              onConfirm={() => confirmItem(item)}
              isPending={isPending}
            />
          ))
        )}
      </div>
    </div>
  )
}

function AuditItemCard({
  item,
  open,
  onToggle,
  state,
  onChange,
  onConfirm,
  isPending,
}: {
  item: AuditItem
  open: boolean
  onToggle: () => void
  state: ItemState
  onChange: (patch: Partial<ItemState>) => void
  onConfirm: () => void
  isPending: boolean
}) {
  const countedN = Number(state.countedUnits)
  const canConfirm =
    state.countedUnits !== "" &&
    !Number.isNaN(countedN) &&
    countedN >= 0 &&
    state.wasteEntries.every((w) => Number(w.value) > 0 && (!reasonMemoRequired(w.reasonCode) || w.reasonMemo.trim()))

  function addWaste() {
    onChange({ wasteEntries: [...state.wasteEntries, { mode: "count", value: "", reasonCode: WASTE_REASON_OPTIONS[0].code, reasonMemo: "" }] })
  }
  function updateWaste(idx: number, patch: Partial<WasteDraft>) {
    const next = state.wasteEntries.map((w, i) => (i === idx ? { ...w, ...patch } : w))
    onChange({ wasteEntries: next })
  }
  function removeWaste(idx: number) {
    onChange({ wasteEntries: state.wasteEntries.filter((_, i) => i !== idx) })
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", state.confirmed && "border-emerald-300")}>
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">{item.rawName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              {item.storage && <span className="rounded bg-muted px-1.5 py-0.5">{item.storage}</span>}
              {state.wasteEntries.length > 0 && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">폐기 {state.wasteEntries.length}건</span>
              )}
            </div>
          </div>
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={state.countedUnits}
          onChange={(e) => onChange({ countedUnits: e.target.value })}
          placeholder="미입력"
          className={cn(
            "h-12 w-20 shrink-0 rounded-lg border-2 border-dashed border-input bg-background text-center text-lg font-extrabold outline-none placeholder:text-xs placeholder:font-semibold placeholder:text-muted-foreground/60",
            state.countedUnits !== "" && "border-solid border-emerald-400 bg-emerald-50",
          )}
        />
      </div>

      {open && (
        <div className="border-t border-border p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">폐기 (상한 게 있으면 먼저 추가)</span>
            <button type="button" onClick={addWaste} className="flex items-center gap-1 text-xs font-bold text-red-600">
              <Plus className="h-3.5 w-3.5" /> 폐기 추가
            </button>
          </div>
          {state.wasteEntries.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {state.wasteEntries.map((w, idx) => (
                <div key={idx} className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => updateWaste(idx, { mode: "count" })}
                        className={cn("rounded px-2 py-1 text-[11px] font-bold", w.mode === "count" && "bg-red-600 text-white")}
                      >
                        개수
                      </button>
                      <button
                        type="button"
                        onClick={() => updateWaste(idx, { mode: "weight" })}
                        className={cn("rounded px-2 py-1 text-[11px] font-bold", w.mode === "weight" && "bg-red-600 text-white")}
                      >
                        무게(g)
                      </button>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={w.value}
                      onChange={(e) => updateWaste(idx, { value: e.target.value })}
                      placeholder="0"
                      className="h-9 w-20 rounded-md border border-input bg-white px-2 text-center text-sm font-bold outline-none"
                    />
                    <select
                      value={w.reasonCode}
                      onChange={(e) => updateWaste(idx, { reasonCode: e.target.value as WasteReasonCode })}
                      className="h-9 flex-1 rounded-md border border-input bg-white px-2 text-xs font-semibold outline-none"
                    >
                      {WASTE_REASON_OPTIONS.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeWaste(idx)} className="rounded-md p-1.5 text-red-600 hover:bg-red-100">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {reasonMemoRequired(w.reasonCode) && (
                    <input
                      type="text"
                      value={w.reasonMemo}
                      onChange={(e) => updateWaste(idx, { reasonMemo: e.target.value })}
                      placeholder="사유를 입력해주세요"
                      className="mt-2 h-9 w-full rounded-md border border-input bg-white px-2 text-xs outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t-2 border-border pt-3">
            <div className="text-[11px] font-bold text-muted-foreground">
              시스템 재고 · {formatRawQty(item.systemStock, item.countSize, item.countUnit).main}
            </div>
            <button
              type="button"
              disabled={!canConfirm || isPending}
              onClick={onConfirm}
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm font-extrabold",
                canConfirm ? "bg-emerald-700 text-white hover:bg-emerald-800" : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              {state.confirmed ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> 확정됨
                </span>
              ) : (
                "품목 확정"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground",
        on && "border-emerald-700 bg-emerald-700 text-white",
      )}
    >
      {children}
    </button>
  )
}
