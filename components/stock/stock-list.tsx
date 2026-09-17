"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { PackageSearch, MapPin, Undo2 } from "lucide-react"
import {
  categoryEmoji,
  formatPacks,
  gaugeMetrics,
  shortageRatio,
  STATUS_LABEL,
  type StockStatus,
} from "@/lib/submat-stock"
import { cn } from "@/lib/utils"
import type { SubmatCategoryInfo, StorageAreaInfo } from "@/lib/supabase/db"

export type StockCardData = {
  submatId: string
  itemName: string
  categoryCode: string | null
  spec: string | null
  packsPerBox: number | null
  minStockPack: number | null
  stock: number
  hold: number
  status: StockStatus
  areaIds: string[]
}

const STATUS_GROUPS: { key: StockStatus; label: string }[] = [
  { key: "short", label: "부족 · 지금 발주" },
  { key: "warn", label: "경고 · 곧 발주" },
  { key: "ok", label: "정상" },
]

const STATUS_DOT: Record<StockStatus, string> = {
  short: "bg-red-600",
  warn: "bg-amber-600",
  ok: "bg-emerald-600",
}
const STATUS_TEXT: Record<StockStatus, string> = {
  short: "text-red-600",
  warn: "text-amber-600",
  ok: "text-emerald-700",
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
const STATUS_CHIP_ON: Record<StockStatus, string> = {
  short: "bg-red-600 text-white border-red-600",
  warn: "bg-amber-600 text-white border-amber-600",
  ok: "bg-emerald-600 text-white border-emerald-600",
}

export function StockList({
  items,
  categories,
  areas,
  storeName,
}: {
  items: StockCardData[]
  categories: SubmatCategoryInfo[]
  areas: StorageAreaInfo[]
  storeName: string
}) {
  const [view, setView] = useState<"area" | "cat">("area")
  const [curCat, setCurCat] = useState<string>("ALL")
  const [curArea, setCurArea] = useState<string>("ALL")
  const [filters, setFilters] = useState<Record<StockStatus, boolean>>({ short: true, warn: true, ok: true })

  const counts = useMemo(() => {
    const c = { short: 0, warn: 0, ok: 0 }
    for (const it of items) c[it.status]++
    return c
  }, [items])

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.code, c.name]))
    return (code: string | null) => (code ? (map.get(code) ?? code) : "-")
  }, [categories])

  const areaName = useMemo(() => {
    const map = new Map(areas.map((a) => [a.id, a.name]))
    return (id: string) => map.get(id) ?? id
  }, [areas])

  function toggleFilter(key: StockStatus) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-emerald-800 p-4 text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">포장부자재 재고</h1>
            <p className="mt-0.5 text-xs text-emerald-100">{storeName}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/stock/count"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
            >
              📋 재고 실사
            </Link>
            <Link
              href="/dashboard/stock/mapping"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
            >
              📍 보관영역 매핑
            </Link>
          </div>
        </div>

        <div className="mt-3 flex rounded-lg bg-white/15 p-0.5">
          {(["area", "cat"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v)
                setCurCat("ALL")
                setCurArea("ALL")
              }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-bold transition-colors",
                view === v ? "bg-white text-emerald-800" : "text-white/85",
              )}
            >
              {v === "area" ? "보관영역별" : "카테고리별"}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex gap-2">
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
              <div className={cn("text-lg font-extrabold text-white", filters[key] && STATUS_TEXT[key])}>
                {counts[key]}
              </div>
              <div className={cn("text-[11px] font-semibold text-white/90", filters[key] && STATUS_TEXT[key])}>
                {STATUS_LABEL[key]}
              </div>
            </button>
          ))}
        </div>
      </div>

      {view === "cat" ? (
        <CategoryChips categories={categories} items={items} curCat={curCat} onSelect={setCurCat} />
      ) : (
        <AreaChips areas={areas} items={items} curArea={curArea} onSelect={setCurArea} />
      )}

      {view === "cat" ? (
        <ByStatusView
          items={items.filter((i) => curCat === "ALL" || i.categoryCode === curCat)}
          filters={filters}
          categoryName={categoryName}
          areaName={areaName}
        />
      ) : (
        <ByAreaView
          items={items}
          areas={curArea === "ALL" ? areas : areas.filter((a) => a.id === curArea)}
          filters={filters}
          categoryName={categoryName}
          areaName={areaName}
        />
      )}

      <p className="px-1 pb-2 text-[11px] leading-relaxed text-muted-foreground">
        현재고 = 트랜잭션 합산(SUM) · 단위 팩 · submat_id 기준 총재고
        <br />
        보관영역 = 위치 태그(다대다) · 영역별 수량은 관리하지 않음(실사 시 카운트) · 경고선 = 최소재고의 125% 이내
      </p>
    </div>
  )
}

function CategoryChips({
  categories,
  items,
  curCat,
  onSelect,
}: {
  categories: SubmatCategoryInfo[]
  items: StockCardData[]
  curCat: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Chip on={curCat === "ALL"} onClick={() => onSelect("ALL")}>
        전체 <span className="opacity-60">{items.length}</span>
      </Chip>
      {categories.map((c) => {
        const n = items.filter((i) => i.categoryCode === c.code).length
        if (n === 0) return null
        return (
          <Chip key={c.code} on={curCat === c.code} onClick={() => onSelect(c.code)}>
            <span>{categoryEmoji(c.code)}</span> {c.name} <span className="opacity-60">{n}</span>
          </Chip>
        )
      })}
    </div>
  )
}

function AreaChips({
  areas,
  items,
  curArea,
  onSelect,
}: {
  areas: StorageAreaInfo[]
  items: StockCardData[]
  curArea: string
  onSelect: (v: string) => void
}) {
  const total = items.filter((i) => i.areaIds.length > 0).length
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Chip on={curArea === "ALL"} onClick={() => onSelect("ALL")}>
        전체 <span className="opacity-60">{total}</span>
      </Chip>
      {areas.map((a) => {
        const n = items.filter((i) => i.areaIds.includes(a.id)).length
        return (
          <Chip key={a.id} on={curArea === a.id} onClick={() => onSelect(a.id)}>
            <MapPin className="h-3.5 w-3.5" /> {a.name} <span className="opacity-60">{n}</span>
          </Chip>
        )
      })}
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

function ByStatusView({
  items,
  filters,
  categoryName,
  areaName,
}: {
  items: StockCardData[]
  filters: Record<StockStatus, boolean>
  categoryName: (code: string | null) => string
  areaName: (id: string) => string
}) {
  const groups = STATUS_GROUPS.filter((g) => filters[g.key])
    .map((g) => ({
      ...g,
      list: items.filter((i) => i.status === g.key).sort((a, b) => shortageRatio(a.stock, a.minStockPack) - shortageRatio(b.stock, b.minStockPack)),
    }))
    .filter((g) => g.list.length > 0)

  if (groups.length === 0) return <EmptyState />

  return (
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
              <StockCard
                key={it.submatId}
                item={it}
                categoryName={categoryName}
                locationLabel={it.areaIds.length > 0 ? it.areaIds.map(areaName).join(" · ") : null}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ByAreaView({
  items,
  areas,
  filters,
  categoryName,
  areaName,
}: {
  items: StockCardData[]
  areas: StorageAreaInfo[]
  filters: Record<StockStatus, boolean>
  categoryName: (code: string | null) => string
  areaName: (id: string) => string
}) {
  const sections = areas
    .map((a) => ({
      area: a,
      list: items
        .filter((i) => i.areaIds.includes(a.id) && filters[i.status])
        .sort((x, y) => shortageRatio(x.stock, x.minStockPack) - shortageRatio(y.stock, y.minStockPack)),
    }))
    .filter((s) => s.list.length > 0)

  if (sections.length === 0) return <EmptyState />

  return (
    <div className="flex flex-col gap-3">
      {sections.map(({ area, list }) => (
        <div key={area.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2">
            <MapPin className="h-3.5 w-3.5 text-sky-700" />
            <span className="text-sm font-extrabold text-sky-700">{area.name}</span>
            <span className="text-xs font-semibold text-sky-700/80">{list.length}종</span>
          </div>
          <div className="flex flex-col gap-2">
            {list.map((it) => {
              const others = it.areaIds.filter((id) => id !== area.id)
              return (
                <StockCard
                  key={it.submatId}
                  item={it}
                  categoryName={categoryName}
                  locationLabel={others.length > 0 ? `다른 영역: ${others.map(areaName).join(" · ")}` : null}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function StockCard({
  item,
  categoryName,
  locationLabel,
}: {
  item: StockCardData
  categoryName: (code: string | null) => string
  locationLabel: string | null
}) {
  const f = formatPacks(item.stock, item.packsPerBox)
  const { fillPct, markPct } = gaugeMetrics(item.stock, item.minStockPack)

  return (
    <Link
      href={`/dashboard/stock/${encodeURIComponent(item.submatId)}`}
      className={cn(
        "flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-transform active:scale-[.995]",
        "border-l-4",
        STATUS_BORDER[item.status],
      )}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-lg">
        {categoryEmoji(item.categoryCode ?? "")}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold">{item.itemName}</span>
          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
            {categoryEmoji(item.categoryCode ?? "")} {categoryName(item.categoryCode)}
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
        {item.minStockPack !== null && (
          <div className="text-[10.5px] font-semibold text-muted-foreground">┃ 발주기준 {item.minStockPack}팩</div>
        )}
        {(item.hold > 0 || locationLabel) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {item.hold > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                <Undo2 className="h-3 w-3" /> 반품대기 {item.hold}팩
              </span>
            )}
            {locationLabel && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                <MapPin className="h-3 w-3" /> {locationLabel}
              </span>
            )}
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
