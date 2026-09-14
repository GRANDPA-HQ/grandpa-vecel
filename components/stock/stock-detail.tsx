"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, MapPin, PackageOpen, ArrowUpDown } from "lucide-react"
import { receiveSubmatStock } from "@/app/actions/submat-stock"
import { formatPacks, gaugeMetrics, isBoxInputMode, statusOf, STATUS_LABEL, categoryEmoji } from "@/lib/submat-stock"
import { cn } from "@/lib/utils"
import type { SubmatStockMaster, SubmatStockTxn } from "@/lib/supabase/db"

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

export function StockDetail({
  master,
  categoryName,
  stock,
  hold,
  mappedAreaNames,
  recentTxns,
}: {
  master: SubmatStockMaster
  categoryName: string
  stock: number
  hold: number
  mappedAreaNames: string[]
  recentTxns: SubmatStockTxn[]
}) {
  const [screen, setScreen] = useState<"detail" | "receive">("detail")

  return screen === "detail" ? (
    <DetailScreen
      master={master}
      categoryName={categoryName}
      stock={stock}
      hold={hold}
      mappedAreaNames={mappedAreaNames}
      recentTxns={recentTxns}
      onReceive={() => setScreen("receive")}
    />
  ) : (
    <ReceiveScreen master={master} stock={stock} onBack={() => setScreen("detail")} />
  )
}

function DetailScreen({
  master,
  categoryName,
  stock,
  hold,
  mappedAreaNames,
  recentTxns,
  onReceive,
}: {
  master: SubmatStockMaster
  categoryName: string
  stock: number
  hold: number
  mappedAreaNames: string[]
  recentTxns: SubmatStockTxn[]
  onReceive: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const status = statusOf(stock, master.minStockPack)
  const f = formatPacks(stock, master.packsPerBox)
  const { fillPct, markPct } = gaugeMetrics(stock, master.minStockPack)
  const shown = showAll ? recentTxns : recentTxns.slice(0, 3)

  return (
    <div className="flex flex-col gap-4 pb-20">
      <Link href="/dashboard/stock" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-emerald-700">
        <ChevronLeft className="h-4 w-4" />
        재고 목록
      </Link>

      <section className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-2xl">
          {categoryEmoji(master.categoryCode ?? "")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold">{master.itemName}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Pill>{master.submatId}</Pill>
            <Pill>단위 · 팩</Pill>
            {master.packsPerBox && <Pill>입수 · {master.packsPerBox}팩/박스</Pill>}
            {master.managePartId && <Pill accent>{master.managePartId} 파트</Pill>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight">{stock}</span>
              <span className="text-lg font-bold text-muted-foreground">팩</span>
            </div>
            {f.conv && <div className="mt-1.5 text-xs font-medium text-muted-foreground">박스 환산 · {f.conv.slice(1, -1)}</div>}
          </div>
          <span className={cn("rounded-lg px-3 py-1.5 text-xs font-extrabold", STATUS_TAG[status])}>{STATUS_LABEL[status]}</span>
        </div>

        <div className="relative mt-4 h-3 rounded-full bg-muted">
          <div className={cn("absolute inset-y-0 left-0 rounded-full", STATUS_FILL[status])} style={{ width: `${fillPct}%` }} />
          {markPct !== null && <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground" style={{ left: `${markPct}%` }} />}
        </div>
        {master.minStockPack !== null && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="inline-block h-3.5 w-0.5 rounded-full bg-foreground" /> 발주기준 {master.minStockPack}팩
          </div>
        )}
        {hold > 0 && (
          <div className="mt-2 text-xs font-bold text-violet-700">↩ 반품대기 {hold}팩 (정상재고와 별개)</div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2.5 text-xs font-bold text-muted-foreground">입고예정</div>
        <p className="text-sm text-muted-foreground">
          입고예정 없음 — 구매(발주) 모듈 연동 전까지는 표시되지 않습니다.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2.5 text-xs font-bold text-muted-foreground">보관영역</div>
        {mappedAreaNames.length === 0 ? (
          <p className="text-sm text-muted-foreground">매핑된 보관영역이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mappedAreaNames.map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
                <MapPin className="h-3.5 w-3.5" /> {name}
              </span>
            ))}
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
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold",
                    t.txnType === "IN" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700",
                  )}
                >
                  {t.txnType === "IN" ? "입고" : "조정"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{t.createdByName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString("ko-KR")}
                    {t.reasonType ? ` · ${t.reasonType}` : ""}
                  </div>
                </div>
                <span className={cn("shrink-0 text-sm font-extrabold", t.qty >= 0 ? "text-emerald-700" : "text-red-600")}>
                  {t.qty >= 0 ? "+" : ""}
                  {t.qty}팩
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-3 shadow-[0_-2px_12px_rgba(0,0,0,.08)]">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={onReceive}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-4 text-lg font-extrabold text-white hover:bg-emerald-800"
          >
            <PackageOpen className="h-5 w-5" />
            입고
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiveScreen({
  master,
  stock,
  onBack,
}: {
  master: SubmatStockMaster
  stock: number
  onBack: () => void
}) {
  const router = useRouter()
  const boxMode = isBoxInputMode(master.packsPerBox)
  const ppb = master.packsPerBox ?? 1
  const [box, setBox] = useState("")
  const [pack, setPack] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const boxN = Number(box) || 0
  const packN = Number(pack) || 0
  const total = boxMode ? boxN * ppb + packN : packN

  function handleSave() {
    if (total <= 0) {
      setError("받은 수량을 입력해주세요.")
      return
    }
    setError(null)
    setConfirming(true)
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await receiveSubmatStock(master.submatId, boxMode ? boxN : null, packN)
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
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xl">
          {categoryEmoji(master.categoryCode ?? "")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold">{master.itemName}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Pill>{master.submatId}</Pill>
            {master.packsPerBox && <Pill>{master.packsPerBox}팩/박스</Pill>}
            {master.managePartId && <Pill accent>{master.managePartId} 파트</Pill>}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 text-xs font-bold text-muted-foreground">받은 수량 입력</div>
        <div className="flex items-end gap-2.5">
          {boxMode && (
            <NumField label="박스" value={box} onChange={setBox} />
          )}
          {boxMode && <div className="pb-4 text-lg font-bold text-muted-foreground">+</div>}
          <NumField label={boxMode ? "낱개 (팩)" : "수량 (팩)"} value={pack} onChange={setPack} />
        </div>

        {boxMode && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3.5 text-center">
            <div className="text-xs font-semibold text-emerald-800">
              {boxN}박스 × {ppb}팩 + {packN}팩
            </div>
            <div className="mt-0.5 text-2xl font-extrabold text-emerald-700">
              {total}
              <span className="ml-1 text-base">팩</span>
            </div>
          </div>
        )}
      </section>

      <section className="flex items-center justify-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-center">
          <div className="text-[11px] font-bold text-muted-foreground">현재고</div>
          <div className="text-xl font-extrabold">{stock}팩</div>
        </div>
        <ArrowUpDown className="h-4 w-4 rotate-90 text-muted-foreground" />
        <div className="text-center">
          <div className="text-[11px] font-bold text-muted-foreground">입고 후</div>
          <div className="text-xl font-extrabold text-emerald-700">{stock + total}팩</div>
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
            disabled={total <= 0}
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
            <ConfirmRow k="품목" v={master.itemName} />
            {boxMode && <ConfirmRow k="입력" v={`${boxN}박스 + ${packN}팩`} />}
            <ConfirmRow k="입고 수량" v={`${total}팩`} big />
            <ConfirmRow k="재고 변화" v={`${stock}팩 → ${stock + total}팩`} />
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

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1">
      <label className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-16 w-full rounded-xl border-2 border-input bg-background text-center text-3xl font-extrabold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
      />
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

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={cn("rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground", accent && "bg-emerald-50 text-emerald-800")}>
      {children}
    </span>
  )
}
