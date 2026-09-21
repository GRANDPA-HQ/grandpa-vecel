"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, PackageOpen, Trash2, ArrowUpDown } from "lucide-react"
import { receiveRawStock, wasteRawStock } from "@/app/actions/raw-stock"
import {
  formatRawQty,
  gaugeMetrics,
  statusOf,
  STATUS_LABEL,
  WASTE_REASON_OPTIONS,
  RETURN_REASON_OPTIONS,
  reasonMemoRequired,
  type WasteReasonCode,
  type ReturnReasonCode,
} from "@/lib/raw-stock"
import { cn } from "@/lib/utils"
import type { RawStockMaster, RawStockTxn, RawCategoryInfo } from "@/lib/supabase/db"

const STATUS_TAG: Record<string, string> = {
  short: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  ok: "bg-emerald-100 text-emerald-700",
}
const STATUS_FILL: Record<string, string> = {
  short: "bg-red-600",
  warn: "bg-amber-600",
  ok: "bg-emerald-600",
}
const TXN_LABEL: Record<string, string> = {
  IN: "입고",
  CONSUME: "소진",
  ADJ: "조정",
  WASTE: "폐기",
  RETURN_HOLD: "반품",
}
const TXN_BADGE: Record<string, string> = {
  IN: "bg-sky-100 text-sky-700",
  CONSUME: "bg-slate-100 text-slate-700",
  ADJ: "bg-amber-100 text-amber-700",
  WASTE: "bg-red-100 text-red-700",
  RETURN_HOLD: "bg-violet-100 text-violet-700",
}

export function RawStockDetail({
  master,
  category,
  stock,
  hold,
  recentTxns,
}: {
  master: RawStockMaster
  category: RawCategoryInfo | undefined
  stock: number
  hold: number
  recentTxns: RawStockTxn[]
}) {
  const [screen, setScreen] = useState<"detail" | "receive" | "waste">("detail")

  if (screen === "receive") {
    return <ReceiveScreen master={master} stock={stock} onBack={() => setScreen("detail")} />
  }
  if (screen === "waste") {
    return <WasteScreen master={master} stock={stock} onBack={() => setScreen("detail")} />
  }
  return (
    <DetailScreen
      master={master}
      category={category}
      stock={stock}
      hold={hold}
      recentTxns={recentTxns}
      onReceive={() => setScreen("receive")}
      onWaste={() => setScreen("waste")}
    />
  )
}

function DetailScreen({
  master,
  category,
  stock,
  hold,
  recentTxns,
  onReceive,
  onWaste,
}: {
  master: RawStockMaster
  category: RawCategoryInfo | undefined
  stock: number
  hold: number
  recentTxns: RawStockTxn[]
  onReceive: () => void
  onWaste: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const status = statusOf(stock, master.minStock)
  const f = formatRawQty(stock, master.countSize, master.countUnit)
  const { fillPct, markPct } = gaugeMetrics(stock, master.minStock)
  const minDisp = master.minStock !== null ? formatRawQty(master.minStock, master.countSize, master.countUnit).main : null
  const shown = showAll ? recentTxns : recentTxns.slice(0, 3)

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Link href="/dashboard/raw-stock" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-emerald-700">
        <ChevronLeft className="h-4 w-4" />
        재고 목록
      </Link>

      <section className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-2xl">
          {category?.emoji ?? "📦"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold">{master.rawName}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Pill>{master.rawCode}</Pill>
            {master.storage && <Pill>{master.storage}</Pill>}
            {master.countUnit && <Pill>개당 {master.countUnit}</Pill>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight">{f.main}</span>
            </div>
            {f.conv && <div className="mt-1.5 text-xs font-medium text-muted-foreground">{f.conv}</div>}
          </div>
          <span className={cn("rounded-lg px-3 py-1.5 text-xs font-extrabold", STATUS_TAG[status])}>{STATUS_LABEL[status]}</span>
        </div>

        <div className="relative mt-4 h-3 rounded-full bg-muted">
          <div className={cn("absolute inset-y-0 left-0 rounded-full", STATUS_FILL[status])} style={{ width: `${fillPct}%` }} />
          {markPct !== null && <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground" style={{ left: `${markPct}%` }} />}
        </div>
        {minDisp && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="inline-block h-3.5 w-0.5 rounded-full bg-foreground" /> 발주기준 {minDisp}
          </div>
        )}
        {hold > 0 && (
          <div className="mt-2 text-xs font-bold text-violet-700">
            ↩ 반품대기 {formatRawQty(hold, master.countSize, master.countUnit).main} (정상재고와 별개)
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2.5 text-xs font-bold text-muted-foreground">최근 입출 기록</div>
        {recentTxns.length === 0 ? (
          <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
        ) : (
          <div className="flex flex-col">
            {shown.map((t) => (
              <div key={t.txnId} className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold", TXN_BADGE[t.txnType])}>
                  {TXN_LABEL[t.txnType] ?? t.txnType}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{t.createdByName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString("ko-KR")}
                    {t.reasonCode ? ` · ${t.reasonCode}` : ""}
                  </div>
                </div>
                <span className={cn("shrink-0 text-sm font-extrabold", t.qty >= 0 ? "text-emerald-700" : "text-red-600")}>
                  {t.qty >= 0 ? "+" : ""}
                  {formatRawQty(Math.abs(t.qty), master.countSize, master.countUnit).main}
                </span>
              </div>
            ))}
            {recentTxns.length > 3 && !showAll && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-1 border-t border-border py-2.5 text-center text-sm font-bold text-emerald-700 hover:opacity-70"
              >
                전체 기록 보기
              </button>
            )}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2.5 border-t border-border bg-background p-3 shadow-[0_-2px_12px_rgba(0,0,0,.08)]">
        <div className="mx-auto flex w-full max-w-3xl gap-2.5">
          <button
            type="button"
            onClick={onWaste}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-input bg-background py-4 text-base font-extrabold text-foreground hover:bg-accent"
          >
            <Trash2 className="h-5 w-5" />
            폐기
          </button>
          <button
            type="button"
            onClick={onReceive}
            className="flex flex-[1.6] items-center justify-center gap-2 rounded-xl bg-emerald-700 py-4 text-lg font-extrabold text-white hover:bg-emerald-800"
          >
            <PackageOpen className="h-5 w-5" />
            입고
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiveScreen({ master, stock, onBack }: { master: RawStockMaster; stock: number; onBack: () => void }) {
  const router = useRouter()
  const [count, setCount] = useState("")
  const [hasReturn, setHasReturn] = useState(false)
  const [returnCount, setReturnCount] = useState("")
  const [returnReason, setReturnReason] = useState<ReturnReasonCode>(RETURN_REASON_OPTIONS[0].code)
  const [returnMemo, setReturnMemo] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const countN = Number(count) || 0
  const returnN = hasReturn ? Number(returnCount) || 0 : 0
  const countSize = master.countSize ?? 0
  const afterStock = stock + countN * countSize

  function handleSave() {
    if (countN <= 0 && returnN <= 0) {
      setError("받은 수량을 입력해주세요.")
      return
    }
    if (hasReturn && returnN > 0 && reasonMemoRequired(returnReason) && !returnMemo.trim()) {
      setError("기타 사유는 메모를 입력해주세요.")
      return
    }
    setError(null)
    setConfirming(true)
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await receiveRawStock(
        master.rawCode,
        countN,
        hasReturn && returnN > 0 ? { count: returnN, reasonCode: returnReason, reasonMemo: returnMemo } : undefined,
      )
      if (result.error) {
        setError(result.error)
        setConfirming(false)
        return
      }
      router.refresh()
      onBack()
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-emerald-700">
        <ChevronLeft className="h-4 w-4" />
        품목상세
      </button>

      <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold">{master.rawName}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Pill>{master.rawCode}</Pill>
            {master.countUnit && <Pill>개당 {master.countUnit}</Pill>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 text-xs font-bold text-muted-foreground">정상 입고 개수</div>
        <NumField label="개수" value={count} onChange={setCount} unit="개" />
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold">반품할 물량이 있어요</span>
          <input
            type="checkbox"
            checked={hasReturn}
            onChange={(e) => setHasReturn(e.target.checked)}
            className="h-5 w-9 accent-emerald-700"
          />
        </label>
        {hasReturn && (
          <div className="mt-3 flex flex-col gap-3">
            <NumField label="반품 개수" value={returnCount} onChange={setReturnCount} unit="개" />
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground">반품 사유</label>
              <div className="flex flex-wrap gap-1.5">
                {RETURN_REASON_OPTIONS.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setReturnReason(r.code)}
                    className={cn(
                      "rounded-lg border border-border px-3 py-1.5 text-xs font-bold",
                      returnReason === r.code && "border-emerald-700 bg-emerald-700 text-white",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {reasonMemoRequired(returnReason) && (
              <input
                type="text"
                value={returnMemo}
                onChange={(e) => setReturnMemo(e.target.value)}
                placeholder="사유를 입력해주세요"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-emerald-600"
              />
            )}
          </div>
        )}
      </section>

      <section className="flex items-center justify-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-center">
          <div className="text-[11px] font-bold text-muted-foreground">현재고</div>
          <div className="text-xl font-extrabold">{formatRawQty(stock, master.countSize, master.countUnit).main}</div>
        </div>
        <ArrowUpDown className="h-4 w-4 rotate-90 text-muted-foreground" />
        <div className="text-center">
          <div className="text-[11px] font-bold text-muted-foreground">입고 후</div>
          <div className="text-xl font-extrabold text-emerald-700">{formatRawQty(afterStock, master.countSize, master.countUnit).main}</div>
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2.5 border-t border-border bg-background p-3 shadow-[0_-2px_12px_rgba(0,0,0,.08)]">
        <div className="mx-auto flex w-full max-w-3xl gap-2.5">
          <button type="button" onClick={onBack} className="flex-1 rounded-xl border border-input bg-background py-4 font-bold text-muted-foreground hover:bg-accent">
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={countN <= 0 && returnN <= 0}
            className="flex-[2] rounded-xl bg-emerald-700 py-4 font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            입고 저장
          </button>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-background p-6 shadow-xl sm:rounded-2xl">
            <h3 className="mb-4 text-lg font-extrabold">입고 내용을 확인하세요</h3>
            <ConfirmRow k="품목" v={master.rawName} />
            <ConfirmRow k="정상 입고" v={`${countN}개`} big />
            {hasReturn && returnN > 0 && <ConfirmRow k="반품" v={`${returnN}개 · ${returnReason}`} />}
            <ConfirmRow k="재고 변화" v={`${formatRawQty(stock, master.countSize, master.countUnit).main} → ${formatRawQty(afterStock, master.countSize, master.countUnit).main}`} />
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="flex-1 rounded-xl border border-input bg-background py-3.5 font-bold text-muted-foreground hover:bg-accent"
              >
                다시 입력
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded-xl bg-emerald-700 py-3.5 font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WasteScreen({ master, stock, onBack }: { master: RawStockMaster; stock: number; onBack: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<"count" | "weight">("count")
  const [value, setValue] = useState("")
  const [reason, setReason] = useState<WasteReasonCode>(WASTE_REASON_OPTIONS[0].code)
  const [memo, setMemo] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const valueN = Number(value) || 0
  const countSize = master.countSize ?? 0
  const wasteG = mode === "count" ? valueN * countSize : valueN
  const afterStock = stock - wasteG

  function handleSave() {
    if (valueN <= 0) {
      setError("0보다 큰 값을 입력해주세요.")
      return
    }
    if (reasonMemoRequired(reason) && !memo.trim()) {
      setError("기타 사유는 메모를 입력해주세요.")
      return
    }
    setError(null)
    setConfirming(true)
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await wasteRawStock(master.rawCode, { mode, value: valueN, reasonCode: reason, reasonMemo: memo })
      if (result.error) {
        setError(result.error)
        setConfirming(false)
        return
      }
      router.refresh()
      onBack()
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-emerald-700">
        <ChevronLeft className="h-4 w-4" />
        품목상세
      </button>

      <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold">{master.rawName}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Pill>{master.rawCode}</Pill>
            {master.countUnit && <Pill>개당 {master.countUnit}</Pill>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex rounded-lg bg-muted p-0.5">
          <button
            type="button"
            onClick={() => {
              setMode("count")
              setValue("")
            }}
            className={cn("flex-1 rounded-md py-1.5 text-xs font-bold", mode === "count" && "bg-card text-emerald-700 shadow-sm")}
          >
            미개봉 통째(개수)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("weight")
              setValue("")
            }}
            className={cn("flex-1 rounded-md py-1.5 text-xs font-bold", mode === "weight" && "bg-card text-emerald-700 shadow-sm")}
          >
            개봉·부분(무게 g)
          </button>
        </div>
        <NumField label={mode === "count" ? "폐기 개수" : "폐기 무게(g)"} value={value} onChange={setValue} unit={mode === "count" ? "개" : "g"} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 text-xs font-bold text-muted-foreground">폐기 사유</div>
        <div className="flex flex-wrap gap-1.5">
          {WASTE_REASON_OPTIONS.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setReason(r.code)}
              className={cn(
                "rounded-lg border border-border px-3 py-1.5 text-xs font-bold",
                reason === r.code && "border-red-600 bg-red-600 text-white",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {reasonMemoRequired(reason) && (
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="사유를 입력해주세요"
            className="mt-3 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-emerald-600"
          />
        )}
      </section>

      <section className="flex items-center justify-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-center">
          <div className="text-[11px] font-bold text-muted-foreground">현재고</div>
          <div className="text-xl font-extrabold">{formatRawQty(stock, master.countSize, master.countUnit).main}</div>
        </div>
        <ArrowUpDown className="h-4 w-4 rotate-90 text-muted-foreground" />
        <div className="text-center">
          <div className="text-[11px] font-bold text-muted-foreground">폐기 후</div>
          <div className="text-xl font-extrabold text-red-600">{formatRawQty(Math.max(0, afterStock), master.countSize, master.countUnit).main}</div>
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2.5 border-t border-border bg-background p-3 shadow-[0_-2px_12px_rgba(0,0,0,.08)]">
        <div className="mx-auto flex w-full max-w-3xl gap-2.5">
          <button type="button" onClick={onBack} className="flex-1 rounded-xl border border-input bg-background py-4 font-bold text-muted-foreground hover:bg-accent">
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={valueN <= 0}
            className="flex-[2] rounded-xl bg-red-600 py-4 font-extrabold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            폐기 저장
          </button>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-background p-6 shadow-xl sm:rounded-2xl">
            <h3 className="mb-4 text-lg font-extrabold">폐기 내용을 확인하세요</h3>
            <ConfirmRow k="품목" v={master.rawName} />
            <ConfirmRow k="폐기 수량" v={mode === "count" ? `${valueN}개` : `${valueN}g`} big />
            <ConfirmRow k="사유" v={WASTE_REASON_OPTIONS.find((r) => r.code === reason)?.label ?? reason} />
            <ConfirmRow
              k="재고 변화"
              v={`${formatRawQty(stock, master.countSize, master.countUnit).main} → ${formatRawQty(Math.max(0, afterStock), master.countSize, master.countUnit).main}`}
            />
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="flex-1 rounded-xl border border-input bg-background py-3.5 font-bold text-muted-foreground hover:bg-accent"
              >
                다시 입력
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded-xl bg-red-600 py-3.5 font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NumField({ label, value, onChange, unit }: { label: string; value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="h-16 w-full rounded-xl border-2 border-input bg-background text-center text-3xl font-extrabold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}

function ConfirmRow({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-3 text-sm first:border-t-0">
      <span className="font-semibold text-muted-foreground">{k}</span>
      <span className={cn("font-extrabold", big && "text-lg text-emerald-700")}>{v}</span>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{children}</span>
}
