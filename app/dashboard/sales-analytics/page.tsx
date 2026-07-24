import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { getSalesOrdersInRange, type SalesOrderRecord } from "@/lib/supabase/db"
import { addDaysKst, addMonthsKst, isValidDateStr, isoToKstDate, kstDateToIso, todayKst } from "@/lib/date-kst"
import { SalesDailyChart } from "@/components/sales-daily-chart"

const PLATFORM_LABEL: Record<string, string> = {
  coupang_eats: "쿠팡이츠",
  baemin: "배민",
}

function isCanceled(status: string): boolean {
  return /cancel|취소/i.test(status)
}

function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`
}

function buildDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  let cur = start
  // 안전장치: 최대 400일까지만 (범위 뒤집힘 등 방지)
  for (let i = 0; i < 400 && cur <= end; i++) {
    dates.push(cur)
    cur = addDaysKst(cur, 1)
  }
  return dates
}

export default async function SalesAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const { start: startParam, end: endParam } = await searchParams

  const today = todayKst()
  const end = isValidDateStr(endParam) ? endParam : today
  const start = isValidDateStr(startParam) ? startParam : addMonthsKst(end, -1)

  const startIso = kstDateToIso(start)
  const endIsoExclusive = kstDateToIso(addDaysKst(end, 1))

  let orders: SalesOrderRecord[] | null = null
  let loadError: string | null = null
  try {
    orders = await getSalesOrdersInRange(startIso, endIsoExclusive)
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

  const presets = [
    { label: "오늘", start: today, end: today },
    { label: "최근 7일", start: addDaysKst(today, -6), end: today },
    { label: "최근 1개월", start: addMonthsKst(today, -1), end: today },
    { label: "최근 3개월", start: addMonthsKst(today, -3), end: today },
  ]

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">매출 분석</h1>
      <p className="text-sm text-muted-foreground">
        쿠팡이츠 · 배민 판매 데이터를 기준으로 기간별 매출을 확인합니다
      </p>
    </div>
  )

  const filterBar = (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <form className="flex flex-wrap items-center gap-2" method="get">
        <input
          type="date"
          name="start"
          defaultValue={start}
          max={end}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        <span className="text-sm text-muted-foreground">~</span>
        <input
          type="date"
          name="end"
          defaultValue={end}
          max={today}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          조회
        </button>
      </form>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <Link
            key={p.label}
            href={`?start=${p.start}&end=${p.end}`}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {p.label}
          </Link>
        ))}
      </div>
    </div>
  )

  if (loadError || orders === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {filterBar}
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">매출 데이터를 불러올 수 없습니다</p>
            <p className="mt-1 text-amber-700">
              tb_sales_order 테이블이 아직 없거나 조회 중 오류가 발생했습니다. 매출 데이터 마이그레이션(DDL)을
              먼저 실행했는지 확인해주세요.
              {loadError ? ` (${loadError})` : ""}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const validOrders = orders.filter((o) => !isCanceled(o.status))

  const totalRevenue = validOrders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
  const totalSettlement = validOrders.reduce((sum, o) => sum + (o.settlement_amount ?? 0), 0)
  const orderCount = validOrders.length
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

  const platformTotals = new Map<string, { revenue: number; count: number }>()
  for (const o of validOrders) {
    const cur = platformTotals.get(o.platform) ?? { revenue: 0, count: 0 }
    cur.revenue += o.total_amount ?? 0
    cur.count += 1
    platformTotals.set(o.platform, cur)
  }

  const dailyTotals = new Map<string, number>()
  for (const o of validOrders) {
    const day = isoToKstDate(o.order_datetime)
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + (o.total_amount ?? 0))
  }
  const dailySeries = buildDateRange(start, end).map((date) => ({
    date,
    total: dailyTotals.get(date) ?? 0,
  }))

  return (
    <div className="flex flex-col gap-6">
      {header}
      {filterBar}

      {orderCount === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          선택한 기간({start} ~ {end})에 집계된 매출 데이터가 없습니다.
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-xl border border-emerald-100 bg-emerald-50 p-5">
              <span className="text-xs font-medium text-emerald-600">총 판매 매출</span>
              <span className="text-2xl font-bold text-emerald-800">{formatWon(totalRevenue)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-blue-100 bg-blue-50 p-5">
              <span className="text-xs font-medium text-blue-600">정산 금액 합계</span>
              <span className="text-2xl font-bold text-blue-800">{formatWon(totalSettlement)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-violet-100 bg-violet-50 p-5">
              <span className="text-xs font-medium text-violet-600">총 주문 건수</span>
              <span className="text-2xl font-bold text-violet-800">{orderCount.toLocaleString("ko-KR")}건</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-orange-100 bg-orange-50 p-5">
              <span className="text-xs font-medium text-orange-600">평균 주문 금액</span>
              <span className="text-2xl font-bold text-orange-800">{formatWon(avgOrderValue)}</span>
            </div>
          </div>

          {/* 일별 매출 차트 */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">일별 매출 추이</h2>
            <SalesDailyChart data={dailySeries} />
          </div>

          {/* 플랫폼별 매출 */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">플랫폼별 매출</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[...platformTotals.entries()].map(([platform, v]) => (
                <div key={platform} className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{PLATFORM_LABEL[platform] ?? platform}</p>
                    <p className="text-xs text-muted-foreground">{v.count.toLocaleString("ko-KR")}건</p>
                  </div>
                  <p className="text-lg font-semibold text-foreground">{formatWon(v.revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
