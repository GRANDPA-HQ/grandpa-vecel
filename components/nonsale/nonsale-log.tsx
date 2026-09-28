"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Search, Trash2 } from "lucide-react"
import { exitNonsaleLogSession } from "@/app/actions/nonsale-auth"
import { saveNonsaleLog, cancelNonsaleLog, type NonsaleLogEntry } from "@/app/actions/nonsale-log"
import { cn } from "@/lib/utils"
import { isoToKstTime } from "@/lib/date-kst"
import { NONSALE_REASON_OPTIONS, nonsaleReasonLabel, nonsaleMemoRequired, type NonsaleReasonCode } from "@/lib/nonsale"
import type { SkuNonsaleItem, NonsaleLogRow } from "@/lib/supabase/db"

// 판매외소진_스태프화면_v0.1.html 목업을 이식 — 카드 그리드 → 바텀시트(개수+사유+메모 입력) →
// 장바구니 누적 → 전체 저장. PIN 인증(직원선택→PIN)은 상위 페이지에서 이미 통과했고, 이
// 컴포넌트는 세션 상속(상단 이름 표시·나가기)과 담기/저장/취소 조작만 담당한다.

type CategoryInfo = { code: string; name: string; emoji: string }

type CartLine = {
  key: string
  skuId: string
  skuName: string
  hasRecipe: boolean
  qty: number
  reasonCode: NonsaleReasonCode
  memo: string
}

type SheetState =
  | { kind: "add"; item: SkuNonsaleItem }
  | { kind: "confirmSave" }
  | { kind: "confirmCancel"; log: NonsaleLogRow }
  | null

export function NonsaleLog({
  staffName,
  storeName,
  items,
  categories,
  myLogs,
}: {
  staffName: string
  storeName: string | null
  items: SkuNonsaleItem[]
  categories: CategoryInfo[]
  myLogs: NonsaleLogRow[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<"rec" | "mine">("rec")
  const [curCat, setCurCat] = useState("ALL")
  const [curQ, setCurQ] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [lastReason, setLastReason] = useState<NonsaleReasonCode | null>(null)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [isPending, startTransition] = useTransition()
  const [isExiting, startExitTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const categoryOrder = useMemo(() => new Map(categories.map((c, i) => [c.code, i])), [categories])
  const categoryOf = useMemo(() => {
    const map = new Map(categories.map((c) => [c.code, c]))
    return (code: string | null) => (code ? map.get(code) : undefined)
  }, [categories])

  const filtered = useMemo(() => {
    const q = curQ.trim().toLowerCase()
    return items
      .filter((it) => {
        const okCat = curCat === "ALL" || it.categoryCode === curCat
        const okQ = !q || it.skuName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q)
        return okCat && okQ
      })
      .sort((a, b) => (categoryOrder.get(a.categoryCode ?? "") ?? 99) - (categoryOrder.get(b.categoryCode ?? "") ?? 99))
  }, [items, curCat, curQ, categoryOrder])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2400)
  }

  function handleExit() {
    startExitTransition(async () => {
      await exitNonsaleLogSession()
      router.refresh()
    })
  }

  function addToCart(item: SkuNonsaleItem, qty: number, reasonCode: NonsaleReasonCode, memo: string) {
    setCart((prev) => [
      ...prev,
      { key: `${item.skuId}-${Date.now()}-${Math.random()}`, skuId: item.skuId, skuName: item.skuName, hasRecipe: item.hasRecipe, qty, reasonCode, memo },
    ])
    setLastReason(reasonCode)
    setSheet(null)
  }
  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key))
  }

  function handleSaveAll() {
    if (cart.length === 0) return
    setError(null)
    startTransition(async () => {
      const entries: NonsaleLogEntry[] = cart.map((l) => ({
        skuId: l.skuId,
        qty: l.qty,
        reasonCode: l.reasonCode,
        memo: l.memo || undefined,
      }))
      const n = entries.length
      const result = await saveNonsaleLog(entries)
      if (result.error) {
        setError(result.error)
        return
      }
      setCart([])
      setSheet(null)
      router.refresh()
      showToast(`${staffName} 님, ${n}건이 기록됐어요`)
    })
  }

  function handleCancel(logId: string) {
    setError(null)
    startTransition(async () => {
      const result = await cancelNonsaleLog(logId)
      if (result.error) {
        setError(result.error)
        return
      }
      setSheet(null)
      router.refresh()
      showToast("기록을 취소했어요")
    })
  }

  const liveMineCount = myLogs.filter((m) => !m.voided).length

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <div className="flex items-center justify-between rounded-xl bg-emerald-800 px-4 py-3 text-white shadow-sm">
        <div>
          <h1 className="text-base font-bold">판매 외 소진</h1>
          <p className="text-xs text-emerald-100">
            {staffName} 님 · SP{storeName ? ` · ${storeName}` : ""}
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
        <p className="mt-1 text-sm text-muted-foreground">팔지 않고 나간 메뉴를 골라 담아 주세요. 다 담으면 한 번에 저장해요.</p>
      </div>

      <div className="flex gap-1 rounded-2xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("rec")}
          className={cn("flex-1 rounded-xl py-2.5 text-sm font-bold text-muted-foreground", tab === "rec" && "bg-card text-emerald-800 shadow-sm")}
        >
          기록하기
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={cn("flex-1 rounded-xl py-2.5 text-sm font-bold text-muted-foreground", tab === "mine" && "bg-card text-emerald-800 shadow-sm")}
        >
          오늘 내 기록{myLogs.length > 0 && <span className="ml-1 text-xs font-medium text-muted-foreground/80">{liveMineCount}</span>}
        </button>
      </div>

      {tab === "rec" ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={curQ}
              onChange={(e) => setCurQ(e.target.value)}
              placeholder="메뉴 이름으로 찾기"
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
              찾는 메뉴가 없어요. 다른 이름으로 찾아보세요.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((it) => (
                <button
                  key={it.skuId}
                  type="button"
                  onClick={() => setSheet({ kind: "add", item: it })}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-transform active:scale-[.99]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xl">
                    {categoryOf(it.categoryCode)?.emoji ?? "▤"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{it.skuName}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {categoryOf(it.categoryCode)?.name ?? it.categoryCode} · {it.skuCode}
                    </div>
                    {!it.hasRecipe && <NoRecipeTag />}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 text-xs font-bold text-emerald-800">담은 목록</div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {cart.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">아직 담긴 게 없어요. 위에서 메뉴를 골라 담아 주세요.</p>
            ) : (
              <>
                {cart.map((l) => (
                  <div key={l.key} className="flex items-center gap-3 border-b border-border p-3.5 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {l.skuName}
                        {!l.hasRecipe && <NoRecipeTag />}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {nonsaleReasonLabel(l.reasonCode)}
                        {l.memo ? ` · ${l.memo}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-emerald-700">{l.qty}개</span>
                    <button type="button" onClick={() => removeLine(l.key)} className="shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">담은 메뉴 {cart.length}건</div>
              </>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-3 shadow-[0_-2px_12px_rgba(0,0,0,.08)]">
            <div className="mx-auto max-w-3xl">
              <button
                type="button"
                disabled={cart.length === 0 || isPending}
                onClick={() => setSheet({ kind: "confirmSave" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                전체 저장
                <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs">{cart.length}건</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-emerald-800">오늘 내가 남긴 기록</div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {myLogs.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">오늘 남긴 기록이 없어요.</p>
            ) : (
              myLogs.map((m) => (
                <div key={m.logId} className={cn("flex items-center gap-3 border-b border-border p-3.5 last:border-b-0", m.voided && "opacity-60")}>
                  <span className="w-11 shrink-0 text-xs text-muted-foreground">{isoToKstTime(m.createdAt)}</span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm font-semibold", m.voided && "text-muted-foreground line-through")}>{m.skuName}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {nonsaleReasonLabel(m.reasonCode)}
                      {m.reasonMemo ? ` · ${m.reasonMemo}` : ""}
                    </div>
                  </div>
                  <span className={cn("shrink-0 text-sm font-bold text-emerald-700", m.voided && "text-muted-foreground line-through")}>{m.qty}개</span>
                  {m.voided ? (
                    <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">취소됨</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: "confirmCancel", log: m })}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      취소
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            수량을 고치려면 취소하고 다시 담아 주세요. 다른 사람 기록이나 어제 이전 기록은 매니저에게 요청해 주세요.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {sheet?.kind === "add" && (
        <AddSheet item={sheet.item} defaultReason={lastReason} onClose={() => setSheet(null)} onAdd={addToCart} />
      )}
      {sheet?.kind === "confirmSave" && (
        <ConfirmSheet
          title="이대로 저장할까요?"
          subtitle={`담은 메뉴 ${cart.length}건`}
          lines={cart.map((l) => ({ key: l.key, label: l.skuName, sub: `${nonsaleReasonLabel(l.reasonCode)}${l.memo ? ` · ${l.memo}` : ""}`, qty: l.qty }))}
          confirmLabel="저장하기"
          pending={isPending}
          onConfirm={handleSaveAll}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "confirmCancel" && (
        <ConfirmSheet
          title="이 기록을 취소할까요?"
          subtitle="취소하면 이 기록은 없던 것이 돼요. 수량을 고치려면 취소한 뒤 다시 담아 주세요."
          lines={[{ key: sheet.log.logId, label: sheet.log.skuName, sub: nonsaleReasonLabel(sheet.log.reasonCode), qty: sheet.log.qty }]}
          confirmLabel="취소하기"
          pending={isPending}
          onConfirm={() => handleCancel(sheet.log.logId)}
          onClose={() => setSheet(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-emerald-900 px-5 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function AddSheet({
  item,
  defaultReason,
  onClose,
  onAdd,
}: {
  item: SkuNonsaleItem
  defaultReason: NonsaleReasonCode | null
  onClose: () => void
  onAdd: (item: SkuNonsaleItem, qty: number, reasonCode: NonsaleReasonCode, memo: string) => void
}) {
  const [qty, setQty] = useState(1)
  const [reasonCode, setReasonCode] = useState<NonsaleReasonCode | null>(defaultReason)
  const [memo, setMemo] = useState("")

  const needMemo = reasonCode ? nonsaleMemoRequired(reasonCode) : false
  const canAdd = !!reasonCode && (!needMemo || memo.trim().length > 0)

  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-lg font-extrabold text-emerald-800">{item.skuName}</h3>
      <div className="mt-1 text-xs text-muted-foreground">{item.skuCode}</div>
      {!item.hasRecipe && (
        <div className="mt-3 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">레시피가 아직 등록되지 않은 메뉴예요. 기록은 그대로 남아요.</div>
      )}

      <div className="mt-5">
        <div className="mb-2 text-xs font-bold">개수</div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            className="h-12 w-12 rounded-xl border border-emerald-200 bg-card text-xl font-bold text-emerald-800 shadow-sm disabled:text-muted-foreground"
          >
            −
          </button>
          <div className="flex h-12 min-w-[88px] items-center justify-center gap-1 rounded-xl border border-border bg-card text-xl font-bold text-emerald-800 shadow-sm">
            {qty}
            <span className="text-sm font-semibold text-muted-foreground">개</span>
          </div>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="h-12 w-12 rounded-xl border border-emerald-200 bg-card text-xl font-bold text-emerald-800 shadow-sm"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-bold">사유</div>
        <div className="grid grid-cols-2 gap-2.5">
          {NONSALE_REASON_OPTIONS.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setReasonCode(r.code)}
              className={cn(
                "rounded-xl border border-border bg-card p-3 text-left shadow-sm",
                reasonCode === r.code && "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600",
              )}
            >
              <div className={cn("text-sm font-bold", reasonCode === r.code && "text-emerald-800")}>{r.label}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{r.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-2.5 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
          <b className="font-semibold text-foreground">채널 환불·POS에 찍은 서비스는 등록하지 않아요.</b> 판매 집계에서 이미 빠져요.
        </div>
      </div>

      <div className="mt-5">
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
          메모
          {needMemo ? <span className="font-semibold text-destructive">· 기타는 꼭 적어 주세요</span> : <span className="font-normal text-muted-foreground">· 선택</span>}
        </label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예) 기한 경과 / 떨어뜨림"
          className={cn(
            "min-h-[60px] w-full rounded-lg border border-border bg-card p-3 text-sm outline-none focus:border-emerald-600",
            needMemo && !memo.trim() && "border-destructive/50",
          )}
        />
      </div>

      <button
        type="button"
        disabled={!canAdd}
        onClick={() => reasonCode && onAdd(item, qty, reasonCode, memo)}
        className="mt-5 w-full rounded-xl bg-emerald-700 py-3.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        담기
      </button>
    </SheetShell>
  )
}

function ConfirmSheet({
  title,
  subtitle,
  lines,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string
  subtitle: string
  lines: { key: string; label: string; sub: string; qty: number }[]
  confirmLabel: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-lg font-extrabold text-emerald-800">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-3 border-b border-border p-3.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{l.label}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{l.sub}</div>
            </div>
            <span className="shrink-0 text-sm font-bold text-emerald-700">{l.qty}개</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={onConfirm}
        className="mt-5 w-full rounded-xl bg-emerald-700 py-3.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {pending ? "처리 중..." : confirmLabel}
      </button>
      <button type="button" onClick={onClose} className="mt-2.5 w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground">
        돌아가기
      </button>
    </SheetShell>
  )
}

function SheetShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted sm:hidden" />
        {children}
      </div>
    </div>
  )
}

function NoRecipeTag() {
  return <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">레시피 미등록</span>
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
