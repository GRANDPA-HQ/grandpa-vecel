// 원재료 재고관리 공용 로직 — 다운로드된 설계자료(TB_RAW_MST v0.8, TB_RAW_STOCK_TXN v0.1,
// 원재료 재고관리_시스템운영규칙/스태프업무가이드 v0.1) 규칙을 그대로 구현한다.
// lib/submat-stock.ts와 같은 판정식(WARN_RATE 등)을 쓰되, 저장 단위가 팩이 아니라 g인 점이 다르다.

export const WARN_RATE = 1.25

export type StockStatus = "short" | "warn" | "ok"

// 상태 판정: 부족(stock≤min) → 경고(min<stock≤min×1.25) → 정상. min이 없으면(아직 미입력) 판정 불가 → 정상 취급.
export function statusOf(stockG: number, minStockG: number | null): StockStatus {
  if (minStockG === null || minStockG <= 0) return "ok"
  if (stockG <= minStockG) return "short"
  if (stockG <= minStockG * WARN_RATE) return "warn"
  return "ok"
}

// 부족도 — 작을수록 급함. 정렬 전용. min이 없으면 가장 여유 있는 것으로 취급해 뒤로 보낸다.
export function shortageRatio(stockG: number, minStockG: number | null): number {
  if (minStockG === null || minStockG <= 0) return Infinity
  return stockG / minStockG
}

// 게이지 — 발주기준(min) 눈금 하나만 겹쳐 그린다. scaleMax는 발주기준이 막대 약 45% 지점에 오도록.
export function gaugeMetrics(stockG: number, minStockG: number | null) {
  const safeMin = minStockG ?? 0
  const scaleMax = Math.max(stockG, safeMin * 2.2, 1)
  const fillPct = Math.min(100, (stockG / scaleMax) * 100)
  const markPct = minStockG !== null ? Math.min(100, (safeMin / scaleMax) * 100) : null
  return { fillPct, markPct }
}

/**
 * 재고 표시 — "N개 · 개당 규격" 원칙(시스템운영규칙 §1). count_size가 있고 g이 그 배수면 개수로,
 * 아니면(규격 미입력·부분량) g/kg로 직접 표기한다.
 */
export function formatRawQty(
  qtyG: number,
  countSize: number | null,
  countUnit: string | null,
): { main: string; conv: string } {
  if (countSize && countSize > 0 && qtyG % countSize === 0) {
    const count = qtyG / countSize
    return { main: `${count}개`, conv: countUnit ? `개당 ${countUnit}` : "" }
  }
  return { main: formatGrams(qtyG), conv: "" }
}

/** g 단위 원시 표기 — 1000g 이상이면 kg로, 정수 kg면 소수점 생략. */
export function formatGrams(qtyG: number): string {
  const abs = Math.abs(qtyG)
  if (abs >= 1000) {
    const kg = qtyG / 1000
    const rounded = Math.round(kg * 100) / 100
    return `${rounded}kg`
  }
  return `${qtyG}g`
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  short: "부족",
  warn: "경고",
  ok: "정상",
}

export const STORAGE_LABEL: Record<string, string> = {
  냉장: "냉장",
  냉동: "냉동",
  상온: "상온",
}
export const STORAGE_OPTIONS = ["냉장", "냉동", "상온"] as const

// ── 폐기(WASTE) 사유 — 시스템운영규칙 §4 / TB_RAW_STOCK_TXN 설계서 §5 ──
export type WasteReasonCode = "SPOIL" | "EXPIRE" | "DROP" | "OTHER"
export const WASTE_REASON_OPTIONS: { code: WasteReasonCode; label: string }[] = [
  { code: "SPOIL", label: "부패" },
  { code: "EXPIRE", label: "기한만료" },
  { code: "DROP", label: "파손" },
  { code: "OTHER", label: "기타" },
]

// ── 반품대기(RETURN_HOLD) 사유 — 시스템운영규칙 §6 ──
export type ReturnReasonCode = "신선도불량" | "파손" | "수량부족" | "오배송" | "기타"
export const RETURN_REASON_OPTIONS: { code: ReturnReasonCode; label: string }[] = [
  { code: "신선도불량", label: "신선도불량" },
  { code: "파손", label: "파손" },
  { code: "수량부족", label: "수량부족" },
  { code: "오배송", label: "오배송" },
  { code: "기타", label: "기타" },
]

/** 사유코드가 '기타'류(OTHER/기타)면 reason_memo 입력이 필수다. */
export function reasonMemoRequired(reasonCode: string): boolean {
  return reasonCode === "OTHER" || reasonCode === "기타"
}
