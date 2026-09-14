// 포장부자재 재고관리 공용 로직 — 설계서(재고관리 스태프 화면설계 1~3, v0.4~v0.7) 표기 규칙을 그대로 구현.
// 서버/클라이언트 양쪽에서 쓰는 순수 함수만 모아둔다.

export const WARN_RATE = 1.25

export type StockStatus = "short" | "warn" | "ok"

// 상태 판정: 부족(stock≤min) → 경고(min<stock≤min×1.25) → 정상. min이 없으면(아직 미입력) 판정 불가 → 정상 취급.
export function statusOf(stock: number, min: number | null): StockStatus {
  if (min === null || min <= 0) return "ok"
  if (stock <= min) return "short"
  if (stock <= min * WARN_RATE) return "warn"
  return "ok"
}

// 부족도 — 작을수록 급함. 정렬 전용. min이 없으면 가장 여유 있는 것으로 취급해 뒤로 보낸다.
export function shortageRatio(stock: number, min: number | null): number {
  if (min === null || min <= 0) return Infinity
  return stock / min
}

// 박스 환산 표기 — packs_per_box가 없거나 1 이하면 박스 표기 생략(팩만).
export function formatPacks(packs: number, packsPerBox: number | null): { main: string; conv: string } {
  const ppb = packsPerBox ?? 0
  if (ppb < 2) return { main: `${packs}팩`, conv: "" }
  const box = Math.floor(packs / ppb)
  const rem = packs % ppb
  let conv = ""
  if (box > 0 && rem > 0) conv = `(${box}박스 + ${rem}팩)`
  else if (box > 0) conv = `(${box}박스)`
  return { main: `${packs}팩`, conv }
}

// 게이지 — 발주기준(min) 눈금 하나만 겹쳐 그린다. scaleMax는 발주기준이 막대 약 45% 지점에 오도록.
export function gaugeMetrics(stock: number, min: number | null) {
  const safeMin = min ?? 0
  const scaleMax = Math.max(stock, safeMin * 2.2, 1)
  const fillPct = Math.min(100, (stock / scaleMax) * 100)
  const markPct = min !== null ? Math.min(100, (safeMin / scaleMax) * 100) : null
  return { fillPct, markPct }
}

// 박스+팩 이중입력 여부 — packs_per_box가 2 이상일 때만 박스 입력칸을 보여준다(그 외엔 팩 단일입력).
export function isBoxInputMode(packsPerBox: number | null): boolean {
  return (packsPerBox ?? 1) >= 2
}

// tb_submat_category_mst.category_emoji 컬럼이 아직 없어(코드 전반 미확인) 코드 기준 정적 매핑으로 대체.
// 실제 카테고리명/정렬순서는 DB(tb_submat_category_mst)에서 그대로 가져오고, 이모지만 이 표로 보완한다.
const CATEGORY_EMOJI: Record<string, string> = {
  CUP: "🥤",
  BOWL: "🥣",
  SMALLCUP: "🧃",
  BAG_CARRIER: "🛍️",
  PACK_AUX: "🧩",
  FOOD_PREP: "🍳",
  FOOD_SAFETY: "🧤",
  STORAGE_WRAP: "📦",
  EQUIP_MAINT: "🧽",
  GENERAL_SUPPLY: "🏷️",
}
export function categoryEmoji(code: string): string {
  return CATEGORY_EMOJI[code] ?? "📦"
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  short: "부족",
  warn: "경고",
  ok: "정상",
}
