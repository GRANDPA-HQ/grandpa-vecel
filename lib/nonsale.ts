// 판매 외 소진 공용 로직 — 다운로드된 설계자료(TB_SKU_NONSALE_LOG v0.2, 판매품_판매외소진_
// 시스템운영규칙/스태프업무가이드/스태프화면 v0.1) 규칙을 그대로 구현한다.

export type NonsaleReasonCode = "MISTAKE" | "CLAIM_REMAKE" | "SERVICE" | "OTHER"

export const NONSALE_REASON_OPTIONS: { code: NonsaleReasonCode; label: string; desc: string }[] = [
  { code: "MISTAKE", label: "제조실수", desc: "만들다 잘못 나온 것" },
  { code: "CLAIM_REMAKE", label: "클레임 재제조", desc: "매장에서 다시 만들어 드린 것" },
  { code: "SERVICE", label: "서비스", desc: "POS 밖에서 무료로 드린 것" },
  { code: "OTHER", label: "기타", desc: "기한 경과 등 · 메모 필수" },
]

export function nonsaleReasonLabel(code: string): string {
  return NONSALE_REASON_OPTIONS.find((r) => r.code === code)?.label ?? code
}

/** 사유코드가 '기타'면 reason_memo 입력이 필수다(운영규칙 §4). */
export function nonsaleMemoRequired(reasonCode: string): boolean {
  return reasonCode === "OTHER"
}
