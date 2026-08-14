"use client"

import { useId, useMemo, useState } from "react"

type DailyPoint = {
  date: string // "YYYY-MM-DD"
  hall: number
  delivery: number
}

const HALL_COLOR = "var(--chart-hall, #2a78d6)"
const DELIVERY_COLOR = "var(--chart-delivery, #eb6834)"

const WIDTH = 960
const HEIGHT = 260
const PAD_LEFT = 56
const PAD_RIGHT = 12
const PAD_TOP = 16
const PAD_BOTTOM = 28
const BAR_MAX_THICKNESS = 24

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
  return `${n.toLocaleString("ko-KR")}원`
}

function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-")
  return `${Number(m)}/${Number(d)}`
}

export function SalesDailyChart({ data }: { data: DailyPoint[] }) {
  const hallGradientId = useId()
  const deliveryGradientId = useId()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.hall + d.delivery), 0)), [data])
  const n = data.length
  const bandWidth = n > 0 ? plotWidth / n : plotWidth
  const barWidth = Math.min(BAR_MAX_THICKNESS, bandWidth * 0.6)

  const ticks = [0, max * 0.25, max * 0.5, max * 0.75, max]

  // x축 라벨은 겹치지 않도록 최대 8개까지만 표시
  const labelStep = Math.max(1, Math.ceil(n / 8))

  const hovered = hoverIdx !== null ? data[hoverIdx] : null
  const hoveredX = hoverIdx !== null ? PAD_LEFT + hoverIdx * bandWidth + bandWidth / 2 : 0

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: HALL_COLOR }} />
          홀(POS)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DELIVERY_COLOR }} />
          배달채널
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="일별 매출 막대 그래프 (홀 vs 배달)"
      >
        <defs>
          <linearGradient id={hallGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HALL_COLOR} stopOpacity="1" />
            <stop offset="100%" stopColor={HALL_COLOR} stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id={deliveryGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={DELIVERY_COLOR} stopOpacity="1" />
            <stop offset="100%" stopColor={DELIVERY_COLOR} stopOpacity="0.85" />
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
                {t >= 10000 ? `${Math.round(t / 1000).toLocaleString("ko-KR")}k` : Math.round(t)}
              </text>
            </g>
          )
        })}

        {/* 막대(홀 아래 + 배달 위 스택) + hover 히트 영역 */}
        {data.map((d, i) => {
          const x = PAD_LEFT + i * bandWidth + (bandWidth - barWidth) / 2
          const hHall = max > 0 ? (d.hall / max) * plotHeight : 0
          const hDelivery = max > 0 ? (d.delivery / max) * plotHeight : 0
          const total = hHall + hDelivery
          const yHall = PAD_TOP + plotHeight - hHall
          const yDelivery = yHall - hDelivery
          const isHovered = hoverIdx === i
          return (
            <g key={d.date}>
              {hHall > 0 && (
                <rect
                  x={x}
                  y={yHall}
                  width={barWidth}
                  height={hHall}
                  fill={`url(#${hallGradientId})`}
                  opacity={isHovered ? 1 : 0.9}
                />
              )}
              {hDelivery > 0 && (
                <rect
                  x={x}
                  y={yDelivery}
                  width={barWidth}
                  height={hDelivery}
                  fill={`url(#${deliveryGradientId})`}
                  opacity={isHovered ? 1 : 0.9}
                />
              )}
              {total === 0 && (
                <rect x={x} y={PAD_TOP + plotHeight - 1} width={barWidth} height={1} fill="currentColor" className="text-border" />
              )}
              {/* 밴드 전체를 덮는 히트 영역 (막대보다 넓게, 키보드 포커스도 지원) */}
              <rect
                x={PAD_LEFT + i * bandWidth}
                y={PAD_TOP}
                width={bandWidth}
                height={plotHeight}
                fill="transparent"
                tabIndex={0}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx((cur) => (cur === i ? null : cur))}
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

        {/* x축 날짜 라벨 (일부만) */}
        {data.map((d, i) =>
          i % labelStep === 0 ? (
            <text
              key={d.date}
              x={PAD_LEFT + i * bandWidth + bandWidth / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {formatDateLabel(d.date)}
            </text>
          ) : null,
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: `${(hoveredX / WIDTH) * 100}%`,
            top: 8,
          }}
        >
          <p className="font-medium text-foreground">{hovered.date}</p>
          <p className="mt-0.5 text-muted-foreground">
            홀 <span className="font-semibold text-foreground">{formatWon(hovered.hall)}</span>
          </p>
          <p className="text-muted-foreground">
            배달 <span className="font-semibold text-foreground">{formatWon(hovered.delivery)}</span>
          </p>
        </div>
      )}
    </div>
  )
}
