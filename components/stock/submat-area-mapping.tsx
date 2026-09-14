"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Check } from "lucide-react"
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

export function SubmatAreaMapping({
  items,
  categories,
  areas,
}: {
  items: MappingItem[]
  categories: SubmatCategoryInfo[]
  areas: StorageAreaInfo[]
}) {
  const [curCat, setCurCat] = useState<string>("ALL")
  const [sheetItem, setSheetItem] = useState<MappingItem | null>(null)

  const areaName = useMemo(() => {
    const map = new Map(areas.map((a) => [a.id, a.name]))
    return (id: string) => map.get(id) ?? id
  }, [areas])

  const grouped = useMemo(() => {
    const filtered = curCat === "ALL" ? items : items.filter((i) => i.categoryCode === curCat)
    const byCat = new Map<string, MappingItem[]>()
    for (const it of filtered) {
      const key = it.categoryCode ?? "-"
      const list = byCat.get(key) ?? []
      list.push(it)
      byCat.set(key, list)
    }
    const order = new Map(categories.map((c, i) => [c.code, i]))
    return Array.from(byCat.entries()).sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
  }, [items, curCat, categories])

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.code, c.name]))
    return (code: string) => map.get(code) ?? code
  }, [categories])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-extrabold">부자재 보관영역 매핑</h1>
        <p className="text-xs text-muted-foreground">이 부자재가 매장 어느 구역에 있는지 담아두는 작업입니다.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <CatChip on={curCat === "ALL"} onClick={() => setCurCat("ALL")}>
          전체 <span className="opacity-60">{items.length}</span>
        </CatChip>
        {categories.map((c) => {
          const n = items.filter((i) => i.categoryCode === c.code).length
          if (n === 0) return null
          return (
            <CatChip key={c.code} on={curCat === c.code} onClick={() => setCurCat(c.code)}>
              <span>{categoryEmoji(c.code)}</span> {c.name} <span className="opacity-60">{n}</span>
            </CatChip>
          )
        })}
      </div>

      <div className="flex flex-col gap-4">
        {grouped.map(([code, list]) => (
          <div key={code} className="flex flex-col gap-2">
            <div className="px-1 text-xs font-bold text-muted-foreground">
              {categoryEmoji(code)} {categoryName(code)} · {list.length}종
            </div>
            <div className="flex flex-col gap-2">
              {list.map((item) => (
                <button
                  key={item.submatId}
                  type="button"
                  onClick={() => setSheetItem(item)}
                  className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 text-left shadow-sm hover:border-emerald-300"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-lg">
                    {categoryEmoji(item.categoryCode ?? "")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{item.itemName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{item.submatId}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {item.areaIds.length === 0 ? (
                        <span className="text-[11px] italic text-muted-foreground/70">아직 담긴 영역 없음</span>
                      ) : (
                        item.areaIds.map((id) => (
                          <span key={id} className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            {areaName(id)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white",
                      item.areaIds.length > 0 ? "bg-emerald-700" : "bg-muted-foreground/40",
                    )}
                  >
                    {item.areaIds.length}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
        <b className="text-foreground">매핑이란</b> — 이 부자재가 매장 어느 구역(보관영역)에 있는지 담아두는 작업입니다. 담아두면
        재고 실사 때 영역별로 자동으로 목록에 나옵니다.
        <br />· 한 부자재가 <b className="text-foreground">여러 영역</b>에 있으면 모두 체크하세요. 실사는 영역별로 세서 합산합니다.
        <br />· 보관영역 자체를 만들거나 지우는 건 <b className="text-foreground">매니저</b>가 합니다.
      </div>

      {sheetItem && (
        <MappingSheet
          item={sheetItem}
          areas={areas}
          onClose={() => setSheetItem(null)}
        />
      )}
    </div>
  )
}

function CatChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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

function MappingSheet({
  item,
  areas,
  onClose,
}: {
  item: MappingItem
  areas: StorageAreaInfo[]
  onClose: () => void
}) {
  const router = useRouter()
  const [checked, setChecked] = useState<Set<string>>(new Set(item.areaIds))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await setSubmatAreaMappings(item.submatId, Array.from(checked))
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-background shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted sm:hidden" />
        <div className="border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-lg">
              {categoryEmoji(item.categoryCode ?? "")}
            </div>
            <div>
              <div className="text-base font-extrabold">{item.itemName}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{item.submatId}</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            이 부자재가 있는 <b className="text-foreground">보관영역</b>을 모두 선택하세요.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {areas.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">등록된 보관영역이 없습니다.</p>
          ) : (
            areas.map((a) => {
              const isChecked = checked.has(a.id)
              return (
                <div
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  className={cn(
                    "mb-1 flex cursor-pointer items-center gap-3.5 rounded-xl border border-transparent px-3 py-3",
                    isChecked && "border-emerald-200 bg-emerald-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-muted-foreground/30 bg-background text-white",
                      isChecked && "border-emerald-700 bg-emerald-700",
                    )}
                  >
                    {isChecked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1 text-sm font-semibold">{a.name}</span>
                </div>
              )
            })
          )}
        </div>

        {error && <p className="px-5 pb-2 text-sm text-destructive">{error}</p>}

        <div className="flex gap-2.5 border-t border-border bg-muted/30 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-24 shrink-0 rounded-xl border border-input bg-background py-3.5 font-bold text-muted-foreground hover:bg-accent"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="flex-1 rounded-xl bg-emerald-700 py-3.5 font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  )
}
