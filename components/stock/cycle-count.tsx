"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MapPin, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react"
import { submitCycleCount } from "@/app/actions/submat-stock"
import { categoryEmoji } from "@/lib/submat-stock"
import { cn } from "@/lib/utils"
import type { StorageAreaInfo } from "@/lib/supabase/db"

export type CycleCountItem = {
  submatId: string
  itemName: string
  categoryCode: string | null
  areaIds: string[]
  systemStock: number
}

type Inputs = Record<string, string> // areaId -> raw input text
type ItemState = { inputs: Inputs; confirmed: boolean }

export function CycleCount({ areas, items }: { areas: StorageAreaInfo[]; items: CycleCountItem[] }) {
  const router = useRouter()
  const [curAreaId, setCurAreaId] = useState<string | null>(areas[0]?.id ?? null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [state, setState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(items.map((it) => [it.submatId, { inputs: {}, confirmed: false }])),
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const itemsByArea = useMemo(() => {
    const map: Record<string, CycleCountItem[]> = {}
    for (const a of areas) map[a.id] = items.filter((it) => it.areaIds.includes(a.id))
    return map
  }, [areas, items])

  function areaProgress(areaId: string) {
    const list = itemsByArea[areaId] ?? []
    const done = list.filter((it) => state[it.submatId]?.confirmed).length
    return { done, total: list.length }
  }

  function setAreaInput(submatId: string, areaId: string, value: string) {
    setState((prev) => ({
      ...prev,
      [submatId]: { ...prev[submatId], inputs: { ...prev[submatId].inputs, [areaId]: value }, confirmed: false },
    }))
  }

  function confirmItem(item: CycleCountItem) {
    const s = state[item.submatId]
    const allFilled = item.areaIds.every((id) => s.inputs[id] !== undefined && s.inputs[id] !== "")
    if (!allFilled) return
    const total = item.areaIds.reduce((sum, id) => sum + (Number(s.inputs[id]) || 0), 0)

    setError(null)
    startTransition(async () => {
      const result = await submitCycleCount(item.submatId, total)
      if (result.error) {
        setError(result.error)
        return
      }
      setState((prev) => ({ ...prev, [item.submatId]: { ...prev[item.submatId], confirmed: true } }))
      router.refresh()
    })
  }

  if (areas.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        등록된 보관영역이 없습니다. 매니저에게 보관영역 등록을 요청하세요.
      </div>
    )
  }

  const curArea = areas.find((a) => a.id === curAreaId) ?? areas[0]
  const curList = itemsByArea[curArea.id] ?? []
  const curProgress = areaProgress(curArea.id)
  const remaining = curList.filter((it) => !state[it.submatId]?.confirmed).length

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div>
        <h1 className="text-lg font-extrabold">정기실사 · 영역 기준</h1>
        <p className="text-xs text-muted-foreground">포장부자재 · 미개봉 팩 기준</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {areas.map((a) => {
          const p = areaProgress(a.id)
          const done = p.total > 0 && p.done === p.total
          const started = p.done > 0
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setCurAreaId(a.id)}
              className={cn(
                "flex min-w-[110px] shrink-0 flex-col items-start gap-0.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-left",
                curArea.id === a.id && "border-emerald-700 bg-emerald-700 text-white",
                done && curArea.id !== a.id && "border-emerald-300 bg-emerald-50",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <MapPin className="h-3.5 w-3.5" /> {a.name}
              </span>
              <span
                className={cn(
                  "text-[10.5px] font-bold",
                  curArea.id === a.id ? "text-white/85" : done ? "text-emerald-700" : "text-muted-foreground",
                )}
              >
                {p.total === 0 ? "품목 없음" : done ? `완료 · ${p.total}개` : started ? `진행중 · ${p.done}/${p.total}` : "미착수"}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold">{curArea.name}</div>
          <div className="text-xs text-muted-foreground">이 영역에 있는 품목 {curList.length}종 · 미개봉 팩만 카운트</div>
        </div>
        <div className="shrink-0 text-right text-xs font-bold text-muted-foreground">
          <b className="text-base text-emerald-700">{curProgress.done}</b> / {curProgress.total}
          <br />
          확정됨
        </div>
      </div>

      <div className="rounded-lg bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
        이 영역 품목을 세어 우측 칸에 입력하세요. <b>개봉해 사용 중인 팩은 제외</b>합니다.
        <br />
        품목명을 누르면 <b>그 품목의 전 영역을 한 번에</b> 입력할 수 있습니다.
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        {curList.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            이 영역에 매핑된 부자재가 없습니다.
          </p>
        ) : (
          curList.map((item) => (
            <ItemAccordion
              key={item.submatId}
              item={item}
              curAreaId={curArea.id}
              areaName={(id) => areas.find((a) => a.id === id)?.name ?? id}
              open={openId === item.submatId}
              onToggle={() => setOpenId(openId === item.submatId ? null : item.submatId)}
              state={state[item.submatId]}
              onInput={(areaId, value) => setAreaInput(item.submatId, areaId, value)}
              onConfirm={() => confirmItem(item)}
              isPending={isPending}
            />
          ))
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-3 shadow-[0_-2px_12px_rgba(0,0,0,.08)]">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center justify-between text-xs font-bold">
            <span>{curArea.name}</span>
            <span className={cn(remaining > 0 && "text-amber-700")}>
              {remaining > 0 ? `${remaining}개 품목 미입력` : "이 영역 완료"}
            </span>
          </div>
          <button
            type="button"
            disabled={remaining > 0}
            onClick={() => {
              const idx = areas.findIndex((a) => a.id === curArea.id)
              const next = areas.slice(idx + 1).find((a) => areaProgress(a.id).total > areaProgress(a.id).done)
              if (next) setCurAreaId(next.id)
            }}
            className="w-full rounded-xl bg-emerald-700 py-4 font-extrabold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            이 영역 실사 완료
          </button>
        </div>
      </div>
    </div>
  )
}

function ItemAccordion({
  item,
  curAreaId,
  areaName,
  open,
  onToggle,
  state,
  onInput,
  onConfirm,
  isPending,
}: {
  item: CycleCountItem
  curAreaId: string
  areaName: (id: string) => string
  open: boolean
  onToggle: () => void
  state: ItemState
  onInput: (areaId: string, value: string) => void
  onConfirm: () => void
  isPending: boolean
}) {
  const otherAreaIds = item.areaIds.filter((id) => id !== curAreaId)
  const singleArea = item.areaIds.length === 1
  const curValue = state.inputs[curAreaId] ?? ""
  const allFilled = item.areaIds.every((id) => state.inputs[id] !== undefined && state.inputs[id] !== "")
  const total = item.areaIds.reduce((sum, id) => sum + (Number(state.inputs[id]) || 0), 0)

  let metaLabel: React.ReactNode = null
  if (singleArea) {
    metaLabel = <XArea checked>이 영역에만 있음</XArea>
  } else {
    const firstOther = otherAreaIds[0]
    const otherFilled = firstOther !== undefined && state.inputs[firstOther] !== undefined && state.inputs[firstOther] !== ""
    metaLabel = otherFilled ? (
      <XArea checked>{areaName(firstOther)} 확인됨</XArea>
    ) : (
      <XArea>{areaName(firstOther)} 미확인</XArea>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-sm", state.confirmed && "border-emerald-300")}>
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-lg">
          {categoryEmoji(item.categoryCode ?? "")}
        </div>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">{item.itemName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">{metaLabel}</div>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={curValue}
          onChange={(e) => onInput(curAreaId, e.target.value)}
          placeholder="미입력"
          className={cn(
            "h-12 w-20 shrink-0 rounded-lg border-2 border-dashed border-input bg-background text-center text-lg font-extrabold outline-none placeholder:text-xs placeholder:font-semibold placeholder:text-muted-foreground/60",
            curValue !== "" && "border-solid border-emerald-400 bg-emerald-50",
          )}
        />
      </div>

      {open && (
        <div className="border-t border-border p-3.5">
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[11.5px] font-semibold leading-relaxed text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            전 영역 한 번에 입력 — 각 영역을 실제로 눈으로 확인하고 넣으세요. 안 보이는 영역을 짐작으로 넣지 마세요.
          </div>
          <div className="flex flex-col">
            {item.areaIds.map((areaId) => (
              <div key={areaId} className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
                <span className={cn("flex flex-1 items-center gap-1.5 text-sm font-semibold", areaId === curAreaId && "text-emerald-700")}>
                  <MapPin className="h-3.5 w-3.5 opacity-70" />
                  {areaName(areaId)}
                  {areaId === curAreaId && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-emerald-700">지금 여기</span>
                  )}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={state.inputs[areaId] ?? ""}
                  onChange={(e) => onInput(areaId, e.target.value)}
                  placeholder="미입력"
                  className={cn(
                    "h-10 w-[74px] shrink-0 rounded-lg border-2 border-dashed border-input bg-background text-center text-base font-extrabold outline-none placeholder:text-[10px] placeholder:font-semibold placeholder:text-muted-foreground/60",
                    (state.inputs[areaId] ?? "") !== "" && "border-solid border-emerald-400 bg-emerald-50",
                  )}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t-2 border-border pt-3">
            <div>
              <div className="text-[11px] font-bold text-muted-foreground">입력 합계</div>
              <div className="text-sm font-extrabold">
                {allFilled ? <span className="text-emerald-700">{total}팩</span> : <span>—</span>}{" "}
                <span className="text-xs font-semibold text-muted-foreground">
                  {allFilled ? `· 시스템 ${item.systemStock}팩${total !== item.systemStock ? ` → ${total > item.systemStock ? "+" : ""}${total - item.systemStock}` : ""}` : `· ${item.areaIds.length - item.areaIds.filter((id) => (state.inputs[id] ?? "") !== "").length}개 영역 미확인`}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={!allFilled || isPending}
              onClick={onConfirm}
              className={cn(
                "rounded-lg px-4 py-2.5 text-sm font-extrabold",
                allFilled ? "bg-emerald-700 text-white hover:bg-emerald-800" : "cursor-not-allowed bg-muted text-muted-foreground",
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

function XArea({ checked, children }: { checked?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold",
        checked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
      )}
    >
      {checked ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {children}
    </span>
  )
}
