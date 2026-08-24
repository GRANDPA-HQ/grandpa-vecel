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
  tb_sku_recipe:  "input_id",
  tb_prod_recipe: "input_id",
  tb_submat_mst:  "submat_id",
  tb_zone_mst:    "zone_id",
  tb_sop_mst:     "sop_id",
  tb_asset_mst:   "asset_id",
}

// 매장(지점) 스코핑 대상 테이블 → 필터에 쓸 컬럼.
// 시니어가 아닌 직원은 본인 소속 매장(employees.store_id) 값과 이 컬럼이 일치하는 행만 볼 수 있다.
// tb_store_mst는 자기 자신이 매장이라 store_id가 아니라 PK("id")로 스코핑한다.
export const STORE_SCOPED_TABLES: Record<string, string> = {
  employees:    "store_id",
  tb_zone_mst:  "store_id",
  tb_store_mst: "id",
}

// 매장 스코핑 강제 필터 생성. 시니어면 필터 없음(전체 조회).
// 매장이 배정되지 않은 비시니어 계정은 존재할 수 없는 값으로 필터링해 아무 데이터도 새지 않게 한다.
export function buildStoreScopeFilter(
  tableName: string,
  isSenior: boolean,
  storeId: string | null,
): { column: string; value: string }[] | undefined {
  if (isSenior) return undefined
  const column = STORE_SCOPED_TABLES[tableName]
  if (!column) return undefined
  return [{ column, value: storeId ?? "00000000-0000-0000-0000-000000000000" }]
}

// store_id가 직접 없고 zone_id로만 간접적으로 매장에 연결된 테이블 → zone_id 컬럼명.
// 해당 매장 소속 zone_id 목록을 먼저 구한 뒤 이 컬럼에 in 필터로 적용해야 한다.
// (실제 조회는 db.ts의 getStoreScopeOptions()에서 tb_zone_mst를 조인해 처리)
export const STORE_SCOPED_VIA_ZONE_TABLES: Record<string, string> = {
  tb_asset_mst: "zone_id",
}

// 테이블 한글 이름 (엑셀 파일명/시트명 등 표시에 사용)
export const TABLE_LABELS: Record<string, string> = {
  tb_raw_mst:            "원재료",
  tb_category_mst:       "카테고리",
  tb_prod_mst:           "생산품",
  users:                 "유저",
  tb_sku_mst:            "판매품",
  tb_sku_recipe:         "판매품 레시피",
  tb_prod_recipe:        "생산품 레시피",
  tb_production_process: "생산 공정",
  employees:             "직원",
  tb_sales_order:        "매출 주문",
  tb_sales_order_item:   "매출 주문 품목",
  tb_sku_platform_alias: "판매품 플랫폼 별칭",
  tb_submat_mst:         "포장 부자재",
  tb_store_mst:          "지점",
  tb_zone_mst:           "구역",
  tb_sop_mst:            "방법서",
  tb_asset_mst:          "시설",
}

// employees 테이블의 FK 컬럼 → 이름 표시용 조회 설정 (화면·엑셀 추출 공용)
// labelOrder: 드롭다운 표시 순서 (없으면 라벨 컬럼 기준 기본 정렬)
export const EMPLOYEE_FK_LOOKUPS: {
  column: string
  table: string
  labelColumn: string
  labelOrder?: string[]
}[] = [
  { column: "store_id",    table: "tb_store_mst", labelColumn: "store_name" },
  { column: "part_id",     table: "parts",     labelColumn: "name_ko" },
  { column: "position_id", table: "positions", labelColumn: "name_ko", labelOrder: ["스태프", "리드", "매니저", "점장"] },
  { column: "rank_id",     table: "ranks",     labelColumn: "name_ko", labelOrder: ["수습", "정규", "시니어"] },
]

// tb_zone_mst 테이블의 FK 컬럼 → 이름 표시용 조회 설정 (PK 컬럼명이 "id"가 아닌 테이블 포함)
export const ZONE_FK_LOOKUPS: {
  column: string
  table: string
  labelColumn: string
  idColumn?: string
}[] = [
  { column: "store_id",     table: "tb_store_mst",     labelColumn: "store_name" },
  { column: "zone_type_id", table: "tb_zone_type_mst", labelColumn: "zone_type_name", idColumn: "zone_type_id" },
]

// tb_asset_mst 테이블의 FK 컬럼 → 이름 표시용 조회 설정.
// zone_id는 tb_zone_mst 자체에 읽을 수 있는 라벨 컬럼이 없어 getZoneOptions()(지점·구역유형 조인)로 별도 처리한다.
export const ASSET_FK_LOOKUPS: {
  column: string
  table: string
  labelColumn: string
  idColumn?: string
}[] = [
  { column: "asset_type_id", table: "tb_asset_type_mst", labelColumn: "asset_type_name", idColumn: "asset_type_id" },
]

// 지정한 라벨 순서대로 옵션 정렬 (순서 목록에 없는 라벨은 기존 순서 그대로 뒤에 붙음)
export function sortOptionsByLabelOrder(
  options: { value: string; label: string }[],
  labelOrder?: string[],
): { value: string; label: string }[] {
  if (!labelOrder || labelOrder.length === 0) return options
  const orderIndex = new Map(labelOrder.map((l, i) => [l, i]))
  return [...options].sort(
    (a, b) =>
      (orderIndex.get(a.label) ?? labelOrder.length) - (orderIndex.get(b.label) ?? labelOrder.length),
  )
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
  // photo_url: 더 이상 사용하지 않아 목록 화면에서 숨김
  tb_sku_mst:     new Set(["is_active", "photo_url"]),
  // sort_order: 작성 화면의 드래그 순서 저장용 내부 컬럼
  tb_sku_recipe:  new Set(["input_id", "sort_order"]),
  tb_prod_recipe: new Set(["input_id", "sort_order"]),
  // raw: 원본 플랫폼 JSON 전체 — 목록 화면에서는 숨기고 필요 시 상세 조회로만 확인
  tb_sales_order: new Set(["raw"]),
  // zone_id: gen_random_uuid() PK — 사람이 읽을 수 있는 코드가 없어 목록 화면에서는 숨김
  tb_zone_mst:    new Set(["zone_id"]),
  // sop_id: gen_random_uuid() PK — sop_code가 사람이 읽는 코드 역할을 하므로 숨김
  tb_sop_mst:     new Set(["sop_id"]),
  // asset_id: gen_random_uuid() PK — asset_code가 사람이 읽는 코드 역할을 하므로 숨김
  tb_asset_mst:   new Set(["asset_id"]),
}

// 테이블별 데이터 테이블 컬럼 표시 순서 (지정 안 한 나머지 컬럼은 기존 순서 그대로 뒤에 붙음)
export const TABLE_COLUMN_ORDER: Record<string, string[]> = {
  tb_sku_mst: ["category_code", "sku_code", "sku_name", "sku_name_en"],
}

// 테이블별 항상 맨 뒤로 보낼 컬럼 (예: 값이 길어 스캔에 방해되는 URL류).
export const TABLE_TRAILING_COLS: Record<string, string[]> = {}

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

// ── 등록 폼/데이터 테이블 공용 드롭박스 옵션 ──────────────────────
// description은 옵션 title(hover 툴팁)로 표시하는 용도 — 선택지가 없는 경우 생략 가능
export type SelectOption = { value: string; label: string; description?: string }
export type MultiOption = string | SelectOption

export const STORAGE_OPTIONS: SelectOption[] = ["냉장", "냉동", "상온"].map((v) => ({ value: v, label: v }))

export const STATUS_OPTIONS: SelectOption[] = ["SEMI", "PREP", "COOK", "UNPROC"].map((v) => ({ value: v, label: v }))

export const UNIT_OPTIONS: SelectOption[] = ["g", "ml", "ea"].map((v) => ({ value: v, label: v }))

// active 컬럼은 DB에서 'active'/'inactive' ENUM(public.active_status)이지만, 다른 boolean
// 컬럼(is_active 등)과 화면 표기를 통일하기 위해 true/false로 라벨만 바꿔서 보여준다.
// 자유 입력이던 필드를 select로 제한해 잘못된 값이 저장되는 것을 막는다.
export const ACTIVE_OPTIONS: SelectOption[] = [
  { value: "active", label: "true" },
  { value: "inactive", label: "false" },
]

export const SKU_MULTI_OPTIONS: Record<string, MultiOption[]> = {
  concept_tags:   ["Daily Balance", "Light & Clean", "Protein Care", "Digestive Comfort", "Recovery Food"],
  meal_time_tags: ["Breakfast", "Lunch", "Dinner"],
  diet_tags:      ["Vegan", "Vegetarian", "Lacto-Ovo"],
  nutrition_tags: ["Gluten-Free", "Low-Carb", "No Sugar", "Low-Sodium", "High-Protein", "Dairy-Free", "Caffeine-Free"],
  allergen_tags:  ALLERGEN_OPTIONS,
}

// 테이블별 등록 폼 입력 순서 (지정 안 한 나머지 컬럼은 기존 순서 그대로 뒤에 붙음)
export const TABLE_FIELD_ORDER: Record<string, string[]> = {
  tb_sku_mst:  ["category_code", "sku_code"],
  tb_raw_mst:  ["category_code", "raw_code"],
  tb_prod_mst: ["category_code", "prod_code"],
  // 지점을 먼저 고른 뒤 그 지점의 구역 유형을 고르는 흐름
  tb_zone_mst: ["store_id", "zone_type_id"],
}

// 테이블별 기본 정렬 컬럼
export const TABLE_DEFAULT_SORT: Record<string, { column: string; dir: "asc" | "desc" }> = {
  tb_sku_mst:      { column: "sku_code", dir: "asc" },
  tb_raw_mst:      { column: "raw_code", dir: "asc" },
  tb_prod_mst:     { column: "prod_code", dir: "asc" },
  tb_category_mst: { column: "category_code", dir: "asc" },
  // 같은 SKU에 속한 재료끼리 뒤섞이지 않고 모여서 보이도록 SKU 기준 정렬
  tb_sku_recipe:   { column: "sku_id", dir: "asc" },
  // 같은 생산품에 속한 원자재끼리 모여서 보이도록 생산품 기준 정렬
  tb_prod_recipe:  { column: "prod_id", dir: "asc" },
  employees:       { column: "name", dir: "asc" },
  tb_sales_order:  { column: "order_datetime", dir: "desc" },
  tb_submat_mst:   { column: "submat_id", dir: "asc" },
  tb_store_mst:    { column: "store_code", dir: "asc" },
  tb_sop_mst:      { column: "sop_code", dir: "asc" },
  tb_asset_mst:    { column: "asset_code", dir: "asc" },
}

// 테이블별 검색 대상 컬럼 (코드/이름 등)
export const TABLE_SEARCH_COLUMNS: Record<string, string[]> = {
  tb_sku_mst:      ["sku_code", "sku_name"],
  tb_raw_mst:      ["raw_code", "raw_name"],
  tb_prod_mst:     ["prod_code", "prod_name"],
  tb_category_mst: ["category_code", "category_name_kr", "category_name_en"],
  users:           ["email"],
  // sku_id/prod_id는 UUID라 직접 검색이 안 되므로, SKU/생산품 코드·이름은
  // id 목록으로 변환해 별도로 검색한다 (memo만 텍스트로 직접 검색)
  tb_sku_recipe:   ["memo"],
  tb_prod_recipe:  ["memo"],
  employees:       ["name", "phone", "email"],
  tb_submat_mst:   ["submat_id", "item_name", "item_name_short"],
  tb_store_mst:    ["store_code", "store_name", "address"],
  tb_zone_mst:     ["memo"],
  tb_sop_mst:      ["sop_code", "sop_title"],
  tb_asset_mst:    ["asset_code", "asset_name", "serial_no"],
}

// tb_sop_mst 드롭박스 옵션 (DB ENUM과 동일한 값)
export const SOP_CATEGORY_OPTIONS: SelectOption[] = [
  { value: "COM", label: "공통" },
  { value: "SP",  label: "매장" },
  { value: "KP",  label: "주방" },
  { value: "OPS", label: "운영" },
  { value: "MGR", label: "관리자" },
]

export const SOP_STATUS_OPTIONS: SelectOption[] = [
  { value: "DRAFT",    label: "초안" },
  { value: "ACTIVE",   label: "사용중" },
  { value: "ARCHIVED", label: "보관됨" },
]

export const SOP_TARGET_TYPE_OPTIONS: SelectOption[] = [
  { value: "PROD",  label: "생산품" },
  { value: "SKU",   label: "판매품" },
  { value: "ASSET", label: "자산" },
  { value: "NONE",  label: "없음" },
]

// tb_asset_type_mst.asset_type 값 (장비/집기/시설 상위 구분) — DB ENUM과 동일한 값
export const ASSET_GROUP_OPTIONS: SelectOption[] = [
  { value: "EQ", label: "장비" },
  { value: "FX", label: "집기" },
  { value: "FC", label: "시설" },
]
