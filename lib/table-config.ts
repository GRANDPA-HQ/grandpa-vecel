// 데이터 테이블 뷰어 공통 설정 — 페이지(서버 컴포넌트)와 커서 페이지네이션
// 서버 액션(app/actions/table-rows.ts)이 동일한 기준으로 조회하도록 공유한다.

export const PAGE_SIZE = 50

// 커서 페이지네이션 커서: 마지막 행의 (정렬 컬럼 값, PK 값)
export type RowCursor = {
  sortValue: string | null
  pkValue: string
}

// 테이블별 PK 컬럼 (기본 "id" 외 추가)
export const TABLE_PK: Record<string, string> = {
  tb_sku_recipe: "input_id",
}

// 테이블 한글 이름 (엑셀 파일명/시트명 등 표시에 사용)
export const TABLE_LABELS: Record<string, string> = {
  tb_raw_mst:            "원자재",
  tb_category_mst:       "카테고리",
  tb_prod_mst:           "생산품",
  users:                 "유저",
  tb_sku_mst:            "판매품",
  tb_sku_recipe:         "판매품 레시피",
  tb_production_process: "생산 공정",
}

// 가격 컬럼 판별: 판매가(sell_price), 구매 단가(purchase_price), 가격(price), 원가(cost) 등
// 표시할 때 천 단위 쉼표(예: 10,000)를 적용한다.
export function isPriceColumn(col: string): boolean {
  return /(^|_)(price|cost)$/.test(col)
}

// 모든 테이블 공통 숨김 컬럼
export const HIDDEN_COLS = new Set(["id", "created_at", "updated_at"])

// 테이블별 추가 숨김 컬럼
export const TABLE_HIDDEN_COLS: Record<string, Set<string>> = {
  tb_prod_mst:   new Set(["active", "owner", "owner_part", "part", "yield_rate"]),
  tb_sku_mst:    new Set(["is_active"]),
  tb_sku_recipe: new Set(["input_id"]),
}

// 테이블별 데이터 테이블 컬럼 표시 순서 (지정 안 한 나머지 컬럼은 기존 순서 그대로 뒤에 붙음)
export const TABLE_COLUMN_ORDER: Record<string, string[]> = {
  tb_sku_mst: ["category_code", "sku_code", "sku_name", "sku_name_en"],
}

// allergen_tags: 식약처 표시 의무 알러지 유발 성분 (ENUM 값 → 한글명)
export const ALLERGEN_OPTIONS: { value: string; label: string }[] = [
  { value: "NONE",       label: "해당없음(확인됨)" },
  { value: "MILK",       label: "우유" },
  { value: "EGG",        label: "알류(가금류만 해당)" },
  { value: "WHEAT",      label: "밀" },
  { value: "TOMATO",     label: "토마토" },
  { value: "CASHEW",     label: "캐슈넛" },
  { value: "ALMOND",     label: "아몬드" },
  { value: "WALNUT",     label: "호두" },
  { value: "PORK",       label: "돼지고기" },
  { value: "CHICKEN",    label: "닭고기" },
  { value: "BEEF",       label: "쇠고기" },
  { value: "SHRIMP",     label: "새우" },
  { value: "BUCKWHEAT",  label: "메밀" },
  { value: "SOY",        label: "대두" },
  { value: "PEANUT",     label: "땅콩" },
  { value: "SESAME",     label: "참깨" },
  { value: "PINE_NUT",   label: "잣" },
  { value: "PEACH",      label: "복숭아" },
  { value: "SHELLFISH",  label: "조개류(굴·전복·홍합 포함)" },
  { value: "SQUID",      label: "오징어" },
  { value: "CRAB",       label: "게" },
  { value: "MACKEREL",   label: "고등어" },
  { value: "SULFITE",    label: "아황산류" },
]

// 테이블별 기본 정렬 컬럼
export const TABLE_DEFAULT_SORT: Record<string, { column: string; dir: "asc" | "desc" }> = {
  tb_sku_mst:      { column: "sku_code", dir: "asc" },
  tb_raw_mst:      { column: "raw_code", dir: "asc" },
  tb_prod_mst:     { column: "prod_code", dir: "asc" },
  tb_category_mst: { column: "category_code", dir: "asc" },
  // 같은 SKU에 속한 재료끼리 뒤섞이지 않고 모여서 보이도록 SKU 기준 정렬
  tb_sku_recipe:   { column: "sku_id", dir: "asc" },
}

// 테이블별 검색 대상 컬럼 (코드/이름 등)
export const TABLE_SEARCH_COLUMNS: Record<string, string[]> = {
  tb_sku_mst:      ["sku_code", "sku_name"],
  tb_raw_mst:      ["raw_code", "raw_name"],
  tb_prod_mst:     ["prod_code", "prod_name"],
  tb_category_mst: ["category_code", "category_name"],
  users:           ["email"],
  // sku_id/prod_id는 UUID라 직접 검색이 안 되므로, SKU/생산품 코드·이름은
  // id 목록으로 변환해 별도로 검색한다 (memo만 텍스트로 직접 검색)
  tb_sku_recipe:   ["memo"],
}
