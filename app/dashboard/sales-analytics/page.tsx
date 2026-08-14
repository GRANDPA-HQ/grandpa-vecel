import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import {
  getAllSalesOrderItems,
  getSalesOrdersInRange,
  getSkuCategories,
  getSkuMenuRecords,
  type SalesOrderRecord,
} from "@/lib/supabase/db"
import {
  addDaysKst,
  addMonthsKst,
  isValidDateStr,
  isoToKstDate,
  isoToKstHour,
  isoToKstWeekday,
  kstDateToIso,
  todayKst,
} from "@/lib/date-kst"
import { SalesDailyChart } from "@/components/sales-daily-chart"
import { SalesHourlyChart } from "@/components/sales-hourly-chart"
import { SalesWeekdayChart } from "@/components/sales-weekday-chart"
import { SimpleTrendChart } from "@/components/simple-trend-chart"
import { getStoreWeather } from "@/lib/weather"
import { cn } from "@/lib/utils"

const PLATFORM_LABEL: Record<string, string> = {
  coupang_eats: "쿠팡이츠",
  baemin: "배민",
  coupang_pos: "홀(POS)",
}

// 매장 내 POS 결제("돈이 들어오는 경로" 기준 홀) vs 배달앱 채널 구분
const HALL_PLATFORMS = new Set(["coupang_pos"])

function isCanceled(status: string): boolean {
  return /cancel|취소/i.test(status)
}

function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`
}

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-")
  return `${Number(m)}/${Number(d)}`
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
  searchParams: Promise<{ start?: string; end?: string; tab?: string; category?: string; sku?: string }>
}) {
  const { start: startParam, end: endParam, tab: tabParam, category: categoryParam, sku: skuParam } =
    await searchParams

  const today = todayKst()
  const end = isValidDateStr(endParam) ? endParam : today
  const start = isValidDateStr(startParam) ? startParam : addMonthsKst(end, -1)
  const tab = tabParam === "menu" ? "menu" : "summary"

  // 탭/드릴다운 상태를 유지하면서 일부 파라미터만 바꾼 URL을 만든다 (undefined면 파라미터 제거)
  function buildHref(overrides: Record<string, string | undefined>): string {
    const merged: Record<string, string | undefined> = {
      start,
      end,
      tab,
      category: categoryParam,
      sku: skuParam,
      ...overrides,
    }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v)
    }
    return `?${params.toString()}`
  }

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

  // 날씨 배지: "일 단위 · 당일" 조회일 때만 표시(실시간 예보 API라 과거 날짜엔 못 붙임)
  const isTodaySingleDayView = start === end && end === today
  const weather = isTodaySingleDayView ? await getStoreWeather() : null

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">매출 분석</h1>
        <p className="text-sm text-muted-foreground">
          홀(POS) · 쿠팡이츠 · 배민 판매 데이터를 기준으로 기간별 매출을 확인합니다
        </p>
      </div>
      <div className="flex gap-1.5">
        {[
          { key: "summary" as const, label: "요약" },
          { key: "menu" as const, label: "메뉴 분석" },
        ].map((t) => (
          <Link
            key={t.key}
            href={buildHref({ tab: t.key, category: undefined, sku: undefined })}
            className={cn(
              "rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
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
      {weather && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
          {weather.emoji} {weather.tempC !== null ? `${Math.round(weather.tempC)}°C` : ""} {weather.label}
          <span className="text-sky-500">· 서래마을점</span>
        </span>
      )}
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

  const dateRange = buildDateRange(start, end)

  const dailyTotals = new Map<string, { hall: number; delivery: number }>()
  const hourlyByDate = new Map<string, { revenue: number; count: number }[]>()
  const weekdayTotals = Array.from({ length: 7 }, () => 0) // 0=월 ~ 6=일
  for (const date of dateRange) {
    hourlyByDate.set(
      date,
      Array.from({ length: 24 }, () => ({ revenue: 0, count: 0 })),
    )
  }
  for (const o of validOrders) {
    const day = isoToKstDate(o.order_datetime)
    const amount = o.total_amount ?? 0
    const dayTotals = dailyTotals.get(day) ?? { hall: 0, delivery: 0 }
    if (HALL_PLATFORMS.has(o.platform)) {
      dayTotals.hall += amount
    } else {
      dayTotals.delivery += amount
    }
    dailyTotals.set(day, dayTotals)

    weekdayTotals[isoToKstWeekday(o.order_datetime)] += amount

    const hourBuckets = hourlyByDate.get(day)
    if (hourBuckets) {
      const hour = isoToKstHour(o.order_datetime)
      hourBuckets[hour].revenue += amount
      hourBuckets[hour].count += 1
    }
  }
  const dailySeries = dateRange.map((date) => ({
    date,
    hall: dailyTotals.get(date)?.hall ?? 0,
    delivery: dailyTotals.get(date)?.delivery ?? 0,
  }))
  const hourlyByDateObj: Record<string, { hour: number; revenue: number; count: number }[]> = {}
  for (const [date, buckets] of hourlyByDate.entries()) {
    hourlyByDateObj[date] = buckets.map((b, hour) => ({ hour, ...b }))
  }

  // ── 메뉴 분석(탭) 집계 — SKU 매핑이 필요해 요약 탭에서는 불필요한 조회를 건너뛴다 ──
  type SkuAgg = { qty: number; revenue: number }
  let categories: Awaited<ReturnType<typeof getSkuCategories>> = []
  let skus: Awaited<ReturnType<typeof getSkuMenuRecords>> = []
  let categoryStats = new Map<string, SkuAgg>()
  let skuStats = new Map<string, SkuAgg>()
  let totalMenuRevenue = 0
  let hasHallEstimate = false
  let selectedSkuChannelQty = new Map<string, number>()
  let selectedSkuDailyQty = new Map<string, number>()

  if (tab === "menu") {
    const [catRecords, skuRecords, allItems] = await Promise.all([
      getSkuCategories(),
      getSkuMenuRecords(),
      getAllSalesOrderItems(),
    ])
    categories = catRecords
    skus = skuRecords

    const skuById = new Map(skuRecords.map((s) => [s.id, s]))
    const validOrderIds = new Set(validOrders.map((o) => o.id))
    const platformByOrderId = new Map(validOrders.map((o) => [o.id, o.platform]))

    for (const item of allItems ?? []) {
      if (item.is_canceled) continue
      if (!validOrderIds.has(item.order_id)) continue
      if (!item.sku_id) continue
      const sku = skuById.get(item.sku_id)
      if (!sku) continue

      // 홀(POS) 품목은 원본에 개별 금액이 없어 현재 판매가 × 수량으로 추정한다
      let revenue: number
      if (item.subtotal != null) {
        revenue = item.subtotal
      } else {
        revenue = item.quantity * (sku.sell_price ?? 0)
        hasHallEstimate = true
      }
      const qty = item.quantity

      const skuAgg = skuStats.get(item.sku_id) ?? { qty: 0, revenue: 0 }
      skuAgg.qty += qty
      skuAgg.revenue += revenue
      skuStats.set(item.sku_id, skuAgg)

      if (sku.category_code) {
        const catAgg = categoryStats.get(sku.category_code) ?? { qty: 0, revenue: 0 }
        catAgg.qty += qty
        catAgg.revenue += revenue
        categoryStats.set(sku.category_code, catAgg)
      }
      totalMenuRevenue += revenue

      if (skuParam && item.sku_id === skuParam) {
        const platform = platformByOrderId.get(item.order_id) ?? "unknown"
        selectedSkuChannelQty.set(platform, (selectedSkuChannelQty.get(platform) ?? 0) + qty)

        const order = validOrders.find((o) => o.id === item.order_id)
        if (order) {
          const day = isoToKstDate(order.order_datetime)
          selectedSkuDailyQty.set(day, (selectedSkuDailyQty.get(day) ?? 0) + qty)
        }
      }
    }
  }

  const selectedCategory = categories.find((c) => c.category_code === categoryParam)
  const selectedSku = skus.find((s) => s.id === skuParam)
  const categorySkus = selectedCategory
    ? skus
        .filter((s) => s.category_code === selectedCategory.category_code)
        .map((s) => ({ sku: s, agg: skuStats.get(s.id) ?? { qty: 0, revenue: 0 } }))
        .sort((a, b) => b.agg.revenue - a.agg.revenue)
    : []
  const categoryRevenue = selectedCategory ? (categoryStats.get(selectedCategory.category_code)?.revenue ?? 0) : 0
  const selectedSkuAgg = selectedSku ? (skuStats.get(selectedSku.id) ?? { qty: 0, revenue: 0 }) : null
  const selectedSkuDailySeries = dateRange.map((date) => ({
    label: formatShortDate(date),
    value: selectedSkuDailyQty.get(date) ?? 0,
  }))
  const selectedSkuChannelTotal = [...selectedSkuChannelQty.values()].reduce((s, v) => s + v, 0)

  return (
    <div className="flex flex-col gap-6">
      {header}
      {filterBar}

      {orderCount === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          선택한 기간({start} ~ {end})에 집계된 매출 데이터가 없습니다.
        </div>
      ) : tab === "menu" ? (
        <>
          {hasHallEstimate && (
            <p className="text-xs text-muted-foreground">
              ※ 홀(POS) 주문은 원본에 품목별 금액이 없어, 해당 품목은 <b>현재 판매가 × 수량</b>으로 매출을
              추정했습니다.
            </p>
          )}

          {/* 1단: 카테고리별 실적 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {categories.map((cat) => {
              const agg = categoryStats.get(cat.category_code) ?? { qty: 0, revenue: 0 }
              const share = totalMenuRevenue > 0 ? (agg.revenue / totalMenuRevenue) * 100 : 0
              const isSelected = cat.category_code === categoryParam
              return (
                <Link
                  key={cat.category_code}
                  href={buildHref({ category: cat.category_code, sku: undefined })}
                  className={cn(
                    "rounded-xl border bg-card p-4 transition-colors",
                    isSelected ? "border-emerald-500 ring-1 ring-emerald-500" : "border-border hover:bg-muted",
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {cat.emoji} {cat.category_name_kr}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatWon(agg.revenue)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {share.toFixed(0)}% · {agg.qty.toLocaleString("ko-KR")}개
                  </p>
                </Link>
              )
            })}
          </div>

          {/* 2단: 선택된 카테고리의 메뉴 리스트 */}
          {selectedCategory && !selectedSku && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {selectedCategory.emoji} {selectedCategory.category_name_kr} — 메뉴별 실적
                </h2>
                <span className="text-xs text-muted-foreground">카테고리 매출 {formatWon(categoryRevenue)}</span>
              </div>
              {categorySkus.length === 0 ? (
                <p className="text-sm text-muted-foreground">이 카테고리에 판매 데이터가 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">SKU</th>
                      <th className="py-2 font-medium">메뉴</th>
                      <th className="py-2 text-right font-medium">수량</th>
                      <th className="py-2 text-right font-medium">매출액</th>
                      <th className="py-2 text-right font-medium">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorySkus.map(({ sku, agg }) => (
                      <tr key={sku.id} className="border-b border-border last:border-0">
                        <td className="py-2 font-mono text-xs text-muted-foreground">{sku.sku_code}</td>
                        <td className="py-2">
                          <Link href={buildHref({ sku: sku.id })} className="font-medium text-foreground hover:underline">
                            {sku.sku_name}
                          </Link>
                        </td>
                        <td className="py-2 text-right text-muted-foreground">{agg.qty.toLocaleString("ko-KR")}개</td>
                        <td className="py-2 text-right text-foreground">{formatWon(agg.revenue)}</td>
                        <td className="py-2 text-right text-muted-foreground">
                          {categoryRevenue > 0 ? ((agg.revenue / categoryRevenue) * 100).toFixed(0) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 3단: 개별 메뉴 상세 */}
          {selectedSku && selectedSkuAgg && (
            <div className="rounded-xl border border-border bg-card p-5">
              <Link
                href={buildHref({ sku: undefined })}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                ← {selectedCategory?.category_name_kr ?? "카테고리"} 목록으로
              </Link>
              <h2 className="mt-2 text-base font-semibold text-foreground">
                {selectedSku.sku_name}{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">{selectedSku.sku_code}</span>
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">판매수량</p>
                  <p className="text-lg font-semibold text-foreground">{selectedSkuAgg.qty.toLocaleString("ko-KR")}개</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">매출액</p>
                  <p className="text-lg font-semibold text-foreground">{formatWon(selectedSkuAgg.revenue)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">전체 매출 비중</p>
                  <p className="text-lg font-semibold text-foreground">
                    {totalMenuRevenue > 0 ? ((selectedSkuAgg.revenue / totalMenuRevenue) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">판매수량 추이</p>
                  <SimpleTrendChart data={selectedSkuDailySeries} valueSuffix="개" ariaLabel="판매수량 추이" />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">채널별 판매 비중</p>
                  <div className="flex flex-col gap-2">
                    {[...selectedSkuChannelQty.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([platform, qty]) => {
                        const pct = selectedSkuChannelTotal > 0 ? (qty / selectedSkuChannelTotal) * 100 : 0
                        return (
                          <div key={platform} className="flex items-center gap-2 text-xs">
                            <span className="w-20 shrink-0 text-muted-foreground">
                              {PLATFORM_LABEL[platform] ?? platform}
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-10 shrink-0 text-right text-muted-foreground">{pct.toFixed(0)}%</span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
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

          {/* 일별 매출 차트 (홀 vs 배달) */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">일별 매출 추이 (홀 vs 배달)</h2>
            <SalesDailyChart data={dailySeries} />
          </div>

          {/* 요일별 패턴 */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">요일별 패턴</h2>
            <SalesWeekdayChart data={weekdayTotals} />
          </div>

          {/* 시간대별 매출 / 주문 건수 차트 */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">시간대별 매출 · 주문 건수</h2>
            <SalesHourlyChart dates={dateRange} hourlyByDate={hourlyByDateObj} defaultDate={end} />
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
