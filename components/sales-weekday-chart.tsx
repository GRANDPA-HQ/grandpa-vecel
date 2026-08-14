"use client"

import { useId, useMemo, useState } from "react"

type WeekdayPoint = {
  weekday: number // 0=월 ~ 6=일
  label: string
  total: number
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]

const WIDTH = 960
const HEIGHT = 200
const PAD_LEFT = 56
const PAD_RIGHT = 12
const PAD_TOP = 16
const PAD_BOTTOM = 28
const BAR_MAX_THICKNESS = 40

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

function formatAxisTick(t: number): string {
  return t >= 10000 ? `${Math.round(t / 1000).toLocaleString("ko-KR")}k` : Math.round(t).toLocaleString("ko-KR")
}

export function SalesWeekdayChart({ data }: { data: number[] /* index 0(월)~6(일) */ }) {
  const gradientId = useId()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const points: WeekdayPoint[] = useMemo(
    () => WEEKDAY_LABELS.map((label, i) => ({ weekday: i, label, total: data[i] ?? 0 })),
    [data],
  )

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const max = useMemo(() => niceMax(Math.max(...points.map((d) => d.total), 0)), [points])
  const n = points.length
  const bandWidth = plotWidth / n
  const barWidth = Math.min(BAR_MAX_THICKNESS, bandWidth * 0.55)
  const ticks = [0, max * 0.5, max]

  const hovered = hoverIdx !== null ? points[hoverIdx] : null
  const hoveredX = hoverIdx !== null ? PAD_LEFT + hoverIdx * bandWidth + bandWidth / 2 : 0

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="요일별 매출 막대 그래프">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-weekday, #2a78d6)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--chart-weekday, #2a78d6)" stopOpacity="0.75" />
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
        {points.map((d, i) => {
          const x = PAD_LEFT + i * bandWidth + (bandWidth - barWidth) / 2
          const h = max > 0 ? (d.total / max) * plotHeight : 0
          const y = PAD_TOP + plotHeight - h
          const isHovered = hoverIdx === i
          return (
            <g key={d.weekday}>
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

        {/* x축 요일 라벨 */}
        {points.map((d, i) => (
          <text
            key={d.weekday}
            x={PAD_LEFT + i * bandWidth + bandWidth / 2}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {d.label}
          </text>
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: `${(hoveredX / WIDTH) * 100}%`,
            top: 8,
          }}
        >
          <p className="font-medium text-foreground">{hovered.label}요일</p>
          <p className="mt-0.5 text-muted-foreground">
            매출 <span className="font-semibold text-foreground">{formatWon(hovered.total)}</span>
          </p>
        </div>
      )}
    </div>
  )
}
