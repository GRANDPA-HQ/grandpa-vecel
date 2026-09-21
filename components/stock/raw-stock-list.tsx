"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PackageSearch, Undo2, LogOut } from "lucide-react"
import { exitRawStockSession } from "@/app/actions/raw-stock-auth"
import {
  formatRawQty,
  gaugeMetrics,
  shortageRatio,
  statusOf,
  STATUS_LABEL,
  STORAGE_OPTIONS,
  type StockStatus,
} from "@/lib/raw-stock"
import { cn } from "@/lib/utils"
import type { RawCategoryInfo } from "@/lib/supabase/db"

export type RawStockCardData = {
  rawCode: string
  rawName: string
  categoryCode: string | null
  storage: string | null
  countSize: number | null
  countUnit: string | null
  minStock: number | null
  stock: number
  hold: number
  status: StockStatus
}

const STATUS_GROUPS: { key: StockStatus; label: string }[] = [
  { key: "short", label: "부족 · 지금 발주" },
  { key: "warn", label: "경고 · 곧 발주" },
  { key: "ok", label: "정상" },
]

const STATUS_TEXT: Record<StockStatus, string> = {
  short: "text-red-600",
  warn: "text-amber-600",
  ok: "text-emerald-700",
}
const STATUS_DOT: Record<StockStatus, string> = {
  short: "bg-red-600",
  warn: "bg-amber-600",
  ok: "bg-emerald-600",
}
const STATUS_BORDER: Record<StockStatus, string> = {
  short: "border-l-red-600",
  warn: "border-l-amber-600",
  ok: "border-l-emerald-600",
}
const STATUS_FILL: Record<StockStatus, string> = {
  short: "bg-red-600",
  warn: "bg-amber-600",
  ok: "bg-emerald-600",
}

export function RawStockList({
  items,
  categories,
  storeName,
}: {
  items: RawStockCardData[]
  categories: RawCategoryInfo[]
  storeName: string
}) {
  const router = useRouter()
  const [curCat, setCurCat] = useState<string>("ALL")
  const [curStorage, setCurStorage] = useState<string>("ALL")
  const [filters, setFilters] = useState<Record<StockStatus, boolean>>({ short: true, warn: true, ok: true })
  const [isPending, startTransition] = useTransition()

  const counts = useMemo(() => {
    const c = { short: 0, warn: 0, ok: 0 }
    for (const it of items) c[it.status]++
    return c
  }, [items])

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.code, c])), [categories])

  const filtered = items.filter(
    (i) => (curCat === "ALL" || i.categoryCode === curCat) && (curStorage === "ALL" || i.storage === curStorage),
  )

  function toggleFilter(key: StockStatus) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleExit() {
    startTransition(async () => {
      await exitRawStockSession()
      router.refresh()
    })
  }

  const groups = STATUS_GROUPS.filter((g) => filters[g.key])
    .map((g) => ({
      ...g,
      list: filtered.filter((i) => i.status === g.key).sort((a, b) => shortageRatio(a.stock, a.minStock) - shortageRatio(b.stock, b.minStock)),
    }))
    .filter((g) => g.list.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-emerald-800 p-4 text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">원재료 재고</h1>
            <p className="mt-0.5 text-xs text-emerald-100">{storeName}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/raw-stock/audit"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
            >
              📋 재고 실사
            </Link>
            <button
              type="button"
              onClick={handleExit}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold text-white hover:bg-white/25"
            >
              <LogOut className="h-3.5 w-3.5" /> 나가기
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          {STATUS_GROUPS.map(({ key }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleFilter(key)}
              className={cn(
                "flex-1 rounded-lg border border-transparent bg-white/15 py-1.5 text-center transition-colors",
                filters[key] && "bg-white",
              )}
            >
              <div className={cn("text-lg font-extrabold text-white", filters[key] && STATUS_TEXT[key])}>{counts[key]}</div>
              <div className={cn("text-[11px] font-semibold text-white/90", filters[key] && STATUS_TEXT[key])}>{STATUS_LABEL[key]}</div>
            </button>
          ))}
        </div>
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

      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[g.key])} />
                <span className={cn("text-sm font-extrabold", STATUS_TEXT[g.key])}>{g.label}</span>
                <span className="text-xs font-semibold text-muted-foreground">{g.list.length}건</span>
              </div>
              <div className="flex flex-col gap-2">
                {g.list.map((it) => (
                  <RawStockCard key={it.rawCode} item={it} category={it.categoryCode ? categoryMap.get(it.categoryCode) : undefined} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 pb-2 text-[11px] leading-relaxed text-muted-foreground">
        현재고 = 트랜잭션 합산(SUM) · 단위 g, 표시는 미개봉 구매단위 개수 · raw_code 기준 총재고
        <br />
        경고선 = 발주기준의 125% 이내 · 보관영역 매핑 없음(보관방식·카테고리로만 구분)
      </p>
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

function RawStockCard({ item, category }: { item: RawStockCardData; category?: RawCategoryInfo }) {
  const f = formatRawQty(item.stock, item.countSize, item.countUnit)
  const { fillPct, markPct } = gaugeMetrics(item.stock, item.minStock)
  const minDisp = item.minStock !== null ? formatRawQty(item.minStock, item.countSize, item.countUnit).main : null

  return (
    <Link
      href={`/dashboard/raw-stock/${encodeURIComponent(item.rawCode)}`}
      className={cn(
        "flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-transform active:scale-[.995]",
        "border-l-4",
        STATUS_BORDER[item.status],
      )}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-lg">
        {category?.emoji ?? "📦"}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold">{item.rawName}</span>
          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
            {category?.emoji} {category?.name ?? item.categoryCode} {item.storage ? `· ${item.storage}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-lg font-extrabold", STATUS_TEXT[item.status])}>{f.main}</span>
          {f.conv && <span className="text-xs font-semibold text-muted-foreground">{f.conv}</span>}
        </div>
        <div className="relative mt-0.5 h-1.5 rounded-full bg-muted">
          <div className={cn("absolute inset-y-0 left-0 rounded-full", STATUS_FILL[item.status])} style={{ width: `${fillPct}%` }} />
          {markPct !== null && <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-red-600" style={{ left: `${markPct}%` }} />}
        </div>
        {minDisp && <div className="text-[10.5px] font-semibold text-muted-foreground">┃ 발주기준 {minDisp}</div>}
        {item.hold > 0 && (
          <div className="pt-0.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
              <Undo2 className="h-3 w-3" /> 반품대기 {formatRawQty(item.hold, item.countSize, item.countUnit).main}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
      <PackageSearch className="h-8 w-8" />
      <p className="text-sm">표시할 품목이 없습니다. 위 필터를 확인해 주세요.</p>
    </div>
  )
}
