"use client"

import { useMemo, useState, useTransition } from "react"
import { MapPin, Plus, X, Search } from "lucide-react"
import { setSubmatAreaMappings } from "@/app/actions/submat-stock"
import { categoryEmoji } from "@/lib/submat-stock"
import { cn } from "@/lib/utils"
import type { SubmatCategoryInfo, StorageAreaInfo } from "@/lib/supabase/db"

export type MappingItem = {
  submatId: string
  itemName: string
  categoryCode: string | null
  areaIds: string[]
}

/**
 * 부자재 보관영역 매핑 — 정기실사(components/stock/cycle-count.tsx) 화면과 같은 구조로,
 * 영역(상부장-1, 상부장-2 ...)을 먼저 고르고 그 영역에 담을 품목을 "+"로 빠르게 추가한다.
 * 예전 버전은 품목을 먼저 고르고 영역 체크박스를 매번 다시 저장했는데, 영역이 여러 개(특히
 * 세분화된 창고)일 때 한 품목씩 붙잡고 있어야 해서 느렸다 — 영역 기준으로 뒤집으면 같은
 * 영역에 있는 품목들을 연달아 탭("착착착")해서 담을 수 있다.
 */
export function SubmatAreaMapping({
  items: initialItems,
  categories,
  areas,
}: {
  items: MappingItem[]
  categories: SubmatCategoryInfo[]
  areas: StorageAreaInfo[]
}) {
  const [items, setItems] = useState<MappingItem[]>(initialItems)
  const [curAreaId, setCurAreaId] = useState<string | null>(areas[0]?.id ?? null)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const itemsByArea = useMemo(() => {
    const map: Record<string, MappingItem[]> = {}
    for (const a of areas) map[a.id] = items.filter((it) => it.areaIds.includes(a.id))
    return map
  }, [areas, items])

  const curArea = areas.find((a) => a.id === curAreaId) ?? areas[0]
  const curList = curArea ? (itemsByArea[curArea.id] ?? []) : []

  function setMembership(item: MappingItem, areaId: string, add: boolean) {
    const prevAreaIds = item.areaIds
    const nextAreaIds = add ? [...prevAreaIds, areaId] : prevAreaIds.filter((id) => id !== areaId)

    // 낙관적으로 먼저 반영 — "+"를 연달아 눌러도 목록이 바로바로 움직여야 착착착 담는 느낌이 난다.
    setItems((prev) => prev.map((it) => (it.submatId === item.submatId ? { ...it, areaIds: nextAreaIds } : it)))
    setPendingId(item.submatId)
    setError(null)

    startTransition(async () => {
      const result = await setSubmatAreaMappings(item.submatId, nextAreaIds)
      if (result.error) {
        setItems((prev) => prev.map((it) => (it.submatId === item.submatId ? { ...it, areaIds: prevAreaIds } : it)))
        setError(result.error)
      }
      setPendingId(null)
    })
  }

  if (areas.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        등록된 보관영역이 없습니다. 매니저에게 보관영역 등록을 요청하세요.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-extrabold">부자재 보관영역 매핑</h1>
        <p className="text-xs text-muted-foreground">이 부자재가 매장 어느 구역에 있는지 담아두는 작업입니다.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {areas.map((a) => {
          const n = (itemsByArea[a.id] ?? []).length
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setCurAreaId(a.id)}
              className={cn(
                "flex min-w-[110px] shrink-0 flex-col items-start gap-0.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-left",
                curArea?.id === a.id && "border-emerald-700 bg-emerald-700 text-white",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <MapPin className="h-3.5 w-3.5" /> {a.name}
              </span>
              <span className={cn("text-[10.5px] font-bold", curArea?.id === a.id ? "text-white/85" : "text-muted-foreground")}>
                {n === 0 ? "담긴 품목 없음" : `${n}종 담김`}
              </span>
            </button>
          )
        })}
      </div>

      {curArea && (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-extrabold">{curArea.name}</div>
              <div className="text-xs text-muted-foreground">이 영역에 담긴 품목 {curList.length}종</div>
            </div>
            <button
              type="button"
              onClick={() => setAddSheetOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-700 px-3.5 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-800"
            >
              <Plus className="h-4 w-4" /> 품목 추가
            </button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            {curList.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                이 영역에 담긴 품목이 없습니다. &ldquo;품목 추가&rdquo;로 담아보세요.
              </p>
            ) : (
              curList.map((item) => (
                <div
                  key={item.submatId}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-base">
                    {categoryEmoji(item.categoryCode ?? "")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{item.itemName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{item.submatId}</div>
                  </div>
                  <button
                    type="button"
                    disabled={pendingId === item.submatId}
                    onClick={() => setMembership(item, curArea.id, false)}
                    title="이 영역에서 빼기"
                    className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div className="rounded-lg border border-dashed border-border bg-card p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
        <b className="text-foreground">매핑이란</b> — 이 부자재가 매장 어느 구역(보관영역)에 있는지 담아두는 작업입니다. 담아두면
        재고 실사 때 영역별로 자동으로 목록에 나옵니다.
        <br />· 한 부자재가 <b className="text-foreground">여러 영역</b>에 있으면 각 영역에서 모두 담아주세요.
        <br />· 보관영역 자체를 만들거나 지우는 건 <b className="text-foreground">매니저</b>가 합니다.
      </div>

      {addSheetOpen && curArea && (
        <AddItemSheet
          area={curArea}
          items={items}
          categories={categories}
          pendingId={pendingId}
          onAdd={(item) => setMembership(item, curArea.id, true)}
          onClose={() => setAddSheetOpen(false)}
        />
      )}
    </div>
  )
}

function AddItemSheet({
  area,
  items,
  categories,
  pendingId,
  onAdd,
  onClose,
}: {
  area: StorageAreaInfo
  items: MappingItem[]
  categories: SubmatCategoryInfo[]
  pendingId: string | null
  onAdd: (item: MappingItem) => void
  onClose: () => void
}) {
  const [curCat, setCurCat] = useState<string>("ALL")
  const [query, setQuery] = useState("")

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((it) => !it.areaIds.includes(area.id))
      .filter((it) => curCat === "ALL" || it.categoryCode === curCat)
      .filter((it) => q === "" || it.itemName.toLowerCase().includes(q) || it.submatId.toLowerCase().includes(q))
  }, [items, area.id, curCat, query])

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.code, c.name]))
    return (code: string) => map.get(code) ?? code
  }, [categories])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-background shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted sm:hidden" />
        <div className="border-b border-border p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-extrabold">{area.name}에 품목 추가</div>
              <p className="mt-0.5 text-xs text-muted-foreground">눌러서 바로 담깁니다 · 여러 개 연달아 눌러도 됩니다</p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="품목명으로 찾기"
              className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
            <CatChip on={curCat === "ALL"} onClick={() => setCurCat("ALL")}>
              전체
            </CatChip>
            {categories.map((c) => (
              <CatChip key={c.code} on={curCat === c.code} onClick={() => setCurCat(c.code)}>
                <span>{categoryEmoji(c.code)}</span> {c.name}
              </CatChip>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {candidates.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              담을 수 있는 품목이 없습니다. 이미 이 영역에 다 담겼거나, 검색 결과가 없습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.map((item) => (
                <button
                  key={item.submatId}
                  type="button"
                  disabled={pendingId === item.submatId}
                  onClick={() => onAdd(item)}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                    {categoryEmoji(item.categoryCode ?? "")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{item.itemName}</div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">
                      {categoryName(item.categoryCode ?? "")} · {item.submatId}
                    </div>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white">
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-muted/30 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-input bg-background py-3.5 font-bold text-muted-foreground hover:bg-accent"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function CatChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground",
        on && "border-emerald-700 bg-emerald-700 text-white",
      )}
    >
      {children}
    </button>
  )
}
