"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Search, Trash2 } from "lucide-react"
import { exitProdLogSession } from "@/app/actions/prod-log-auth"
import { saveProdLog, type ProdLogEntry } from "@/app/actions/prod-log"
import { cn } from "@/lib/utils"
import type { ProdLogItem, RawCategoryInfo } from "@/lib/supabase/db"
import type { WorkingStaffOption } from "@/app/actions/raw-stock-auth"

// 생산관리스태프화면_v0.1.html 목업을 그대로 이식 — 카드 그리드 → 바텀시트(작업자별 무게+시간
// 입력) → 장바구니 누적 → 전체 저장. PIN 인증(직원선택→PIN)은 상위 페이지에서 이미 통과했고,
// 이 컴포넌트는 세션 상속(상단 이름 표시·나가기)만 담당한다.

const STAGE_LABEL: Record<string, string> = { PREP: "전처리", SEMI: "반제품", COOK: "조리완료", UNPROC: "미가공" }

type WorkerInput = { big: string; small: string; ea: string; min: string }

type CartLine = {
  key: string
  prodCode: string
  prodName: string
  hasRecipe: boolean
  recipeHId: string | null
  workerId: string
  workerName: string
  outputQty: number
  qtyDisplay: string
  laborMin: number
  memo: string
}

function isVolUnit(unit: string) {
  return unit === "ml" || unit === "L"
}

function fmtQty(base: number, unit: string): string {
  if (unit === "ea") return `${base}개`
  const vol = isVolUnit(unit)
  return base >= 1000 ? `${(base / 1000).toString().replace(/\.0+$/, "")}${vol ? "L" : "kg"}` : `${base}${vol ? "ml" : "g"}`
}

export function ProductionRecord({
  staffName,
  onDuty,
  items,
  categories,
}: {
  staffName: string
  onDuty: WorkingStaffOption[]
  items: ProdLogItem[]
  categories: RawCategoryInfo[]
}) {
  const router = useRouter()
  const [curCat, setCurCat] = useState("ALL")
  const [curQ, setCurQ] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [sheetProd, setSheetProd] = useState<ProdLogItem | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isExiting, startExitTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const sessionStaff = onDuty.find((s) => s.name === staffName) ?? onDuty[0]

  const filtered = useMemo(() => {
    const q = curQ.trim().toLowerCase()
    return items.filter((p) => {
      const okCat = curCat === "ALL" || p.categoryCode === curCat
      const okQ = !q || p.prodName.toLowerCase().includes(q) || p.prodCode.toLowerCase().includes(q)
      return okCat && okQ
    })
  }, [items, curCat, curQ])

  const categoryEmoji = useMemo(() => {
    const map = new Map(categories.map((c) => [c.code, c.emoji]))
    return (code: string | null) => (code ? (map.get(code) ?? "▤") : "▤")
  }, [categories])

  function addLines(lines: CartLine[]) {
    setCart((prev) => [...prev, ...lines])
  }
  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key))
  }

  function handleExit() {
    startExitTransition(async () => {
      await exitProdLogSession()
      router.refresh()
    })
  }

  function handleSaveAll() {
    if (cart.length === 0) return
    setError(null)
    startTransition(async () => {
      const entries: ProdLogEntry[] = cart.map((l) => ({
        prodCode: l.prodCode,
        workerId: l.workerId,
        outputQty: l.outputQty,
        laborMin: l.laborMin,
        memo: l.memo || undefined,
        recipeHId: l.recipeHId ?? undefined,
      }))
      const result = await saveProdLog(entries)
      if (result.error) {
        setError(result.error)
        return
      }
      setCart([])
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <div className="flex items-center justify-between rounded-xl bg-emerald-800 px-4 py-3 text-white shadow-sm">
        <div>
          <h1 className="text-base font-bold">생산 기록</h1>
          <p className="text-xs text-emerald-100">
            {staffName} 님 {sessionStaff?.partCode ? `· ${sessionStaff.partCode}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExit}
          disabled={isExiting}
          className="flex items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold hover:bg-white/25"
        >
          <LogOut className="h-3.5 w-3.5" /> 나가기
        </button>
      </div>

      <div>
        <div className="text-lg font-bold text-emerald-800">{staffName} 님, 오늘도 반가워요</div>
        <p className="mt-1 text-sm text-muted-foreground">방금 만든 품목을 골라 담아 주세요. 다 담으면 한 번에 저장하면 돼요.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={curQ}
          onChange={(e) => setCurQ(e.target.value)}
          placeholder="품목명 또는 코드로 찾기"
          className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm outline-none focus:border-emerald-600"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip on={curCat === "ALL"} onClick={() => setCurCat("ALL")}>
          전체
        </Chip>
        {categories.map((c) => (
          <Chip key={c.code} on={curCat === c.code} onClick={() => setCurCat(c.code)}>
            <span>{c.emoji}</span> {c.name}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          찾는 품목이 없어요. 다른 이름으로 찾아보세요.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <button
              key={p.prodId}
              type="button"
              onClick={() => setSheetProd(p)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-transform active:scale-[.99]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xl">
                {categoryEmoji(p.categoryCode)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.prodName}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{STAGE_LABEL[p.prodStage ?? ""] ?? p.prodStage}</span>
                  <span>·</span>
                  <span>{p.prodCode}</span>
                </div>
                {!p.hasRecipe && (
                  <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    레시피 미등록
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 text-xs font-bold text-emerald-800">담은 목록</div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {cart.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">아직 담긴 게 없어요. 위에서 만든 품목을 골라 담아 주세요.</p>
        ) : (
          <>
            {cart.map((l) => (
              <div key={l.key} className="flex items-center gap-3 border-b border-border p-3.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    {l.prodName}
                    {!l.hasRecipe && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">레시피 미등록</span>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {l.workerName} 님{l.memo ? ` · ${l.memo}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{l.laborMin}분</span>
                <span className="shrink-0 text-sm font-bold text-emerald-700">{l.qtyDisplay}</span>
                <button type="button" onClick={() => removeLine(l.key)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
              담은 품목 {cart.length}건 · 저장하면 각 품목이 생산 기록으로 남고 재고에 반영돼요.
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-3 shadow-[0_-2px_12px_rgba(0,0,0,.08)]">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            disabled={cart.length === 0 || isPending}
            onClick={handleSaveAll}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {isPending ? "저장 중..." : "전체 저장"}
            <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs">{cart.length}건</span>
          </button>
        </div>
      </div>

      {sheetProd && (
        <ProductSheet
          product={sheetProd}
          onDuty={onDuty}
          defaultWorkerId={sessionStaff?.id ?? onDuty[0]?.id ?? ""}
          onClose={() => setSheetProd(null)}
          onAdd={(lines) => {
            addLines(lines)
            setSheetProd(null)
          }}
        />
      )}
    </div>
  )
}

function ProductSheet({
  product,
  onDuty,
  defaultWorkerId,
  onClose,
  onAdd,
}: {
  product: ProdLogItem
  onDuty: WorkingStaffOption[]
  defaultWorkerId: string
  onClose: () => void
  onAdd: (lines: CartLine[]) => void
}) {
  const ordered = useMemo(
    () =>
      [...onDuty].sort((a, b) => {
        const pa = a.partCode === "KP" ? 0 : 1
        const pb = b.partCode === "KP" ? 0 : 1
        if (pa !== pb) return pa - pb
        return a.name.localeCompare(b.name, "ko")
      }),
    [onDuty],
  )
  const [selected, setSelected] = useState<string[]>(defaultWorkerId ? [defaultWorkerId] : [])
  const [inputs, setInputs] = useState<Record<string, WorkerInput>>({})
  const [memo, setMemo] = useState("")

  const isEa = product.unit === "ea"
  const vol = isVolUnit(product.unit)
  const bigLabel = vol ? "L" : "kg"
  const smallLabel = vol ? "ml" : "g"

  function toggleWorker(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]))
  }
  function updateInput(id: string, patch: Partial<WorkerInput>) {
    setInputs((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { big: "", small: "", ea: "", min: "" }), ...patch } }))
  }
  function onBigChange(id: string, v: string) {
    const g = v === "" ? "" : String(Math.round(parseFloat(v) * 1000))
    updateInput(id, { big: v, small: Number.isNaN(Number(g)) ? "" : g })
  }
  function onSmallChange(id: string, v: string) {
    const big = v === "" ? "" : String(parseFloat(v) / 1000)
    updateInput(id, { small: v, big: Number.isNaN(Number(big)) ? "" : big })
  }

  function workerQty(id: string): number | null {
    const v = inputs[id] ?? { big: "", small: "", ea: "", min: "" }
    if (isEa) {
      const n = parseFloat(v.ea)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    const n = v.small !== "" ? parseFloat(v.small) : v.big !== "" ? parseFloat(v.big) * 1000 : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }
  function workerLaborMin(id: string): number | null {
    const n = parseInt(inputs[id]?.min ?? "", 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const allValid = selected.length > 0 && selected.every((id) => workerQty(id) !== null && workerLaborMin(id) !== null)
  const total = selected.reduce((sum, id) => sum + (workerQty(id) ?? 0), 0)

  function handleAdd() {
    if (!allValid) return
    const lines: CartLine[] = selected.map((id) => {
      const qty = workerQty(id)!
      const min = workerLaborMin(id)!
      const worker = onDuty.find((w) => w.id === id)
      return {
        key: `${product.prodCode}-${id}-${Date.now()}-${Math.random()}`,
        prodCode: product.prodCode,
        prodName: product.prodName,
        hasRecipe: product.hasRecipe,
        recipeHId: product.recipeHId,
        workerId: id,
        workerName: worker?.name ?? "-",
        outputQty: qty,
        qtyDisplay: fmtQty(qty, product.unit),
        laborMin: min,
        memo: memo.trim(),
      }
    })
    onAdd(lines)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted sm:hidden" />
        <h3 className="text-lg font-extrabold text-emerald-800">{product.prodName}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{STAGE_LABEL[product.prodStage ?? ""] ?? product.prodStage}</span>
          <span>·</span>
          <span>{product.prodCode}</span>
          <span>·</span>
          <span>관리단위 {product.unit}</span>
        </div>
        {product.hasRecipe && product.stdLaborMin ? (
          <div className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">
            적정 작업시간 · <b>약 {product.stdLaborMin}분</b> <span className="text-emerald-700/70">(참고용)</span>
          </div>
        ) : (
          !product.hasRecipe && (
            <div className="mt-3 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              레시피가 아직 등록되지 않은 품목이에요. 생산품 재고는 정확히 쌓이고, 원재료 자동 차감은 레시피가 등록되면 켜져요.
            </div>
          )
        )}

        <div className="mt-4">
          <div className="mb-2 text-xs font-bold">
            작업자 <span className="font-normal text-muted-foreground">· 탭하면 그 사람 입력줄이 생겨요</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ordered.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => toggleWorker(w.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold",
                  selected.includes(w.id) && "border-emerald-700 bg-emerald-700 text-white",
                )}
              >
                {w.name}
                {w.partCode && (
                  <span className={cn("rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700", selected.includes(w.id) && "bg-white/25 text-white")}>
                    {w.partCode}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {selected.length >= 2 && (
          <div className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">각자 만든 만큼 나눠서 입력해요.</div>
        )}

        <div className="mt-2 flex flex-col gap-3">
          {selected.map((id) => {
            const w = onDuty.find((x) => x.id === id)
            const v = inputs[id] ?? { big: "", small: "", ea: "", min: "" }
            return (
              <div key={id} className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                <div className="mb-2.5 flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{w?.name}</span>
                  {w?.partCode && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{w.partCode}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">만든 {isEa ? "개수" : "무게"}</span>
                  {isEa ? (
                    <NumField value={v.ea} onChange={(val) => updateInput(id, { ea: val })} unit="개" />
                  ) : (
                    <>
                      <NumField value={v.big} onChange={(val) => onBigChange(id, val)} unit={bigLabel} />
                      <span className="text-sm text-muted-foreground">=</span>
                      <NumField value={v.small} onChange={(val) => onSmallChange(id, val)} unit={smallLabel} />
                    </>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">작업 시간</span>
                  <NumField value={v.min} onChange={(val) => updateInput(id, { min: val })} unit="분" />
                </div>
              </div>
            )
          })}
        </div>

        {selected.length >= 2 && total > 0 && (
          <div className="mt-3 text-right text-sm text-emerald-800">
            총 만든 {isEa ? "개수" : "무게"} · <b>{fmtQty(total, product.unit)}</b>
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-bold text-muted-foreground">메모 (선택)</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예) 상태 좋았음 / 특이사항"
            className="min-h-[60px] w-full rounded-lg border border-border bg-card p-3 text-sm outline-none focus:border-emerald-600"
          />
        </div>

        <button
          type="button"
          disabled={!allValid}
          onClick={handleAdd}
          className="mt-4 w-full rounded-xl bg-emerald-700 py-3.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          담기
        </button>
      </div>
    </div>
  )
}

function NumField({ value, onChange, unit }: { value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <div className="relative flex-1">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-11 w-full rounded-lg border border-input bg-background pr-10 text-right text-base font-bold outline-none focus:border-emerald-600"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{unit}</span>
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
