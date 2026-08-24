// 원재료/생산품 코드(예: RAW-BEV-001, PROD-VFR-002)에서 사진 파일명 규칙(카테고리-번호)을 뽑아낸다.
// 화면 표시(components/data-table.tsx)와 엑셀 추출(app/api/export)이 같은 사진을 가리키도록
// 이 파싱 로직을 한 곳에 모아 공유한다.
const CODE_RE = /^(?:(?:RAW|PROD)-)?([A-Z][A-Z0-9_]*)[-_](\d+)$/i

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp"] as const

export function parseImageCode(code: string): { category: string; num: string } | null {
  const match = code.match(CODE_RE)
  if (!match) return null
  return { category: match[1].toUpperCase(), num: match[2] }
}
