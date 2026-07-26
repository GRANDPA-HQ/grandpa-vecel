"use client"

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from "react"

type HourlyPoint = {
  hour: number // 0~23
  revenue: number
  count: number
}

const WIDTH = 960
const HEIGHT = 160
const PAD_LEFT = 56
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 24
const BAR_MAX_THICKNESS = 20
const HOUR_LABEL_STEP = 3

// 축 눈금을 0 / 1,000 / 5,000 처럼 깔끔한 값으로 반올림
function niceMax(value: number): number {
  if (value <= 0) return 10
  const exp = Math.floor(Math.log10(value))
  const base = Math.pow(10, exp)
  const fraction = value / base
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * base
}

function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`
}

function formatCount(n: number): string {
  return `${n.toLocaleString("ko-KR")}건`
}

function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-")
  return `${Number(m)}월 ${Number(d)}일`
}

function formatHourLabel(hour: number): string {
  return `${hour}시`
}

function formatAxisTick(t: number): string {
  return t >= 10000 ? `${Math.round(t / 1000).toLocaleString("ko-KR")}k` : Math.round(t).toLocaleString("ko-KR")
}

function HourlyBarChart({
  data,
  valueKey,
  max,
  color,
  hoverIdx,
  onHover,
  ariaLabel,
}: {
  data: HourlyPoint[]
  valueKey: "revenue" | "count"
  max: number
  color: string
  hoverIdx: number | null
  onHover: Dispatch<SetStateAction<number | null>>
  ariaLabel: string
}) {
  const gradientId = useId()
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const n = data.length
  const bandWidth = n > 0 ? plotWidth / n : plotWidth
  const barWidth = Math.min(BAR_MAX_THICKNESS, bandWidth * 0.6)
  const ticks = [0, max * 0.5, max]

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {/* 그리드라인 + y축 눈금 */}
      {ticks.map((t, i) => {
        const y = PAD_TOP + plotHeight - (t / max) * plotHeight
        return (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
            <text
              x={PAD_LEFT - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {formatAxisTick(t)}
            </text>
          </g>
        )
      })}

      {/* 막대 + hover 히트 영역 */}
      {data.map((d, i) => {
        const value = d[valueKey]
        const x = PAD_LEFT + i * bandWidth + (bandWidth - barWidth) / 2
        const h = max > 0 ? (value / max) * plotHeight : 0
        const y = PAD_TOP + plotHeight - h
        const isHovered = hoverIdx === i
        return (
          <g key={d.hour}>
            <rect
              x={x}
              y={h > 0 ? y : PAD_TOP + plotHeight - 1}
              width={barWidth}
              height={Math.max(h, h > 0 ? 1 : 0)}
              rx={4}
              fill={`url(#${gradientId})`}
              opacity={isHovered ? 1 : 0.9}
            />
            <rect
              x={PAD_LEFT + i * bandWidth}
              y={PAD_TOP}
              width={bandWidth}
              height={plotHeight}
              fill="transparent"
              tabIndex={0}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover((cur) => (cur === i ? null : cur))}
              onFocus={() => onHover(i)}
              onBlur={() => onHover((cur) => (cur === i ? null : cur))}
            />
            {isHovered && (
              <line
                x1={PAD_LEFT + i * bandWidth + bandWidth / 2}
                x2={PAD_LEFT + i * bandWidth + bandWidth / 2}
                y1={PAD_TOP}
                y2={PAD_TOP + plotHeight}
                stroke="currentColor"
                strokeWidth={1}
                className="text-border"
                pointerEvents="none"
              />
            )}
          </g>
        )
      })}

      {/* x축 시간 라벨 (3시간 간격) */}
      {data.map((d, i) =>
        i % HOUR_LABEL_STEP === 0 ? (
          <text
            key={d.hour}
            x={PAD_LEFT + i * bandWidth + bandWidth / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {formatHourLabel(d.hour)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

export function SalesHourlyChart({
  dates,
  hourlyByDate,
  defaultDate,
}: {
  dates: string[]
  hourlyByDate: Record<string, HourlyPoint[]>
  defaultDate: string
}) {
  const [selectedDate, setSelectedDate] = useState(defaultDate)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const data = hourlyByDate[selectedDate] ?? []
  const revenueMax = useMemo(() => niceMax(Math.max(...data.map((d) => d.revenue), 0)), [data])
  const countMax = useMemo(() => niceMax(Math.max(...data.map((d) => d.count), 0)), [data])
  const hasData = data.some((d) => d.revenue > 0 || d.count > 0)

  const hovered = hoverIdx !== null ? (data[hoverIdx] ?? null) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="hourly-date-select" className="text-sm text-muted-foreground">
          날짜 선택
        </label>
        <select
          id="hourly-date-select"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value)
            setHoverIdx(null)
          }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          {dates.map((date) => (
            <option key={date} value={date}>
              {formatDateLabel(date)}
            </option>
          ))}
        </select>
        {hovered && (
          <span className="text-xs text-muted-foreground sm:ml-auto">
            {formatHourLabel(hovered.hour)} · 매출{" "}
            <span className="font-semibold text-foreground">{formatWon(hovered.revenue)}</span> · 주문{" "}
            <span className="font-semibold text-foreground">{formatCount(hovered.count)}</span>
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          선택한 날짜({formatDateLabel(selectedDate)})에 집계된 매출 데이터가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">시간대별 매출</p>
            <HourlyBarChart
              data={data}
              valueKey="revenue"
              max={revenueMax}
              color="var(--chart-revenue, #10b981)"
              hoverIdx={hoverIdx}
              onHover={setHoverIdx}
              ariaLabel="시간대별 매출 막대 그래프"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">시간대별 주문 건수</p>
            <HourlyBarChart
              data={data}
              valueKey="count"
              max={countMax}
              color="var(--chart-count, #7c3aed)"
              hoverIdx={hoverIdx}
              onHover={setHoverIdx}
              ariaLabel="시간대별 주문 건수 막대 그래프"
            />
          </div>
        </div>
      )}
    </div>
  )
}
