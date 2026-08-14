"use client"

import { useId, useMemo, useState } from "react"

type Point = { label: string; value: number }

const WIDTH = 960
const HEIGHT = 170
const PAD_LEFT = 48
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 24
const BAR_MAX_THICKNESS = 22

// 축 눈금을 0 / 1,000 / 5,000 처럼 깔끔한 값으로 반올림
function niceMax(value: number): number {
  if (value <= 0) return 10
  const exp = Math.floor(Math.log10(value))
  const base = Math.pow(10, exp)
  const fraction = value / base
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * base
}

/** 단일 계열 막대 추이 차트 — SKU 판매수량 추이 등에 재사용하는 범용 컴포넌트. */
export function SimpleTrendChart({
  data,
  valueSuffix = "",
  ariaLabel,
}: {
  data: Point[]
  valueSuffix?: string
  ariaLabel: string
}) {
  const gradientId = useId()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data])
  const n = data.length
  const bandWidth = n > 0 ? plotWidth / n : plotWidth
  const barWidth = Math.min(BAR_MAX_THICKNESS, bandWidth * 0.6)
  const ticks = [0, max * 0.5, max]
  const labelStep = Math.max(1, Math.ceil(n / 8))

  const hovered = hoverIdx !== null ? data[hoverIdx] : null
  const hoveredX = hoverIdx !== null ? PAD_LEFT + hoverIdx * bandWidth + bandWidth / 2 : 0

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-bar, #10b981)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--chart-bar, #10b981)" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => {
          const y = PAD_TOP + plotHeight - (t / max) * plotHeight
          return (
            <g key={i}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="currentColor" strokeWidth={1} className="text-border" />
              <text x={PAD_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                {Math.round(t).toLocaleString("ko-KR")}
              </text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const x = PAD_LEFT + i * bandWidth + (bandWidth - barWidth) / 2
          const h = max > 0 ? (d.value / max) * plotHeight : 0
          const y = PAD_TOP + plotHeight - h
          const isHovered = hoverIdx === i
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={x}
                y={h > 0 ? y : PAD_TOP + plotHeight - 1}
                width={barWidth}
                height={Math.max(h, h > 0 ? 1 : 0)}
                rx={3}
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
            </g>
          )
        })}

        {data.map((d, i) =>
          i % labelStep === 0 ? (
            <text
              key={`${d.label}-${i}`}
              x={PAD_LEFT + i * bandWidth + bandWidth / 2}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {d.label}
            </text>
          ) : null,
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: `${(hoveredX / WIDTH) * 100}%`, top: 4 }}
        >
          <p className="font-medium text-foreground">{hovered.label}</p>
          <p className="mt-0.5 text-muted-foreground">
            <span className="font-semibold text-foreground">{hovered.value.toLocaleString("ko-KR")}</span>
            {valueSuffix}
          </p>
        </div>
      )}
    </div>
  )
}
