-- tb_raw_mst 재고구조 컬럼 추가 (v0.8)
-- 근거: 다운로드된 "02.원재료 마스터_TB_RAW_MST_설계서_v0.8.xlsx" / "TB_RAW_MST_migration_v06_to_v08.sql"
--
-- ⚠️ 라이브 스키마 확인 결과, 다운로드된 마이그레이션 스크립트를 그대로 실행하면 안 된다:
--   - purchase_price(78/132행) · supplier(116/132) · buy_link(82/132) · brand(119/132)에
--     이미 실데이터가 들어있다. 원 스크립트는 이 컬럼들을 삭제(발주 테이블로 이관 전제)하지만
--     발주(공급처) 테이블이 아직 없어 이관처가 없으므로, 이번 마이그레이션에서는 삭제하지 않는다.
--     (별도 세션 — 발주 테이블 설계 후 이관 예정)
--   - safety_stock / purchase_qty / price_per_unit / purchase_section_id / lead_time_days /
--     purchase_mode / allergen_tags는 애초에 존재하지 않아 원 스크립트의 DROP 대상이 아니다.
--   - tb_raw_category_mst라는 별도 테이블은 없다 — 카테고리는 이미 tb_category_mst
--     (category_type='RAW & PROD')에 10종+emoji로 존재한다. 신규 테이블 불필요.
--   - raw_code(varchar(20))에 UNIQUE 제약이 없었다(중복 없음, 132행 확인). tb_raw_stock_txn의
--     FK 선행조건으로 이번에 추가한다.
--   - manage_part_id는 설계서 표기(varchar)와 달리 uuid로 parts(id)를 참조한다
--     (staff.part_id와 동일 관례, 설계서 부속결정 D-2와 일치하는 선택).
--
-- Supabase SQL Editor에서 실행하세요.

begin;

-- 1) FK 선행조건: raw_code UNIQUE 제약 (중복 없음 확인됨)
alter table tb_raw_mst
  add constraint uq_raw_mst_raw_code unique (raw_code);

-- 2) 관리수준 (COUNT=개수관리 기본 / PRECISE=정밀관리)
alter table tb_raw_mst
  add column tracking_level varchar(10) not null default 'COUNT'
  constraint chk_raw_mst_tracking_level check (tracking_level in ('COUNT', 'PRECISE'));

-- 3) 규격 — 1개당 g(count_size) · 표시 라벨(count_unit). pack_qty/pack_unit(레시피 BOM용, 이미 사용 중)과는
--    별개로 재고 전용으로 신규 추가한다(중복이지만 레시피 코드에 영향 없이 안전하게 분리).
alter table tb_raw_mst add column count_size numeric;
alter table tb_raw_mst add column count_unit varchar(20);
comment on column tb_raw_mst.count_size is '재고 표시용 규격 — 1개당 g. 개수 × count_size = 총 g. pack_qty(레시피 BOM용)와 별개';
comment on column tb_raw_mst.count_unit is '재고 표시용 라벨(예: 2kg, 907g, 개). count_size는 계산용 g, 이건 표시용';

-- 4) 발주기준(min_stock) · 목표재고(par_stock) — g 저장, 표시는 개수(count_size로 환산)
alter table tb_raw_mst add column min_stock numeric;
alter table tb_raw_mst add column par_stock numeric;
comment on column tb_raw_mst.min_stock is '발주기준. 현재고(g) ≤ min_stock 이면 부족. NULL=기준 미설정';
comment on column tb_raw_mst.par_stock is '목표재고. 발주량 = par_stock − 현재고. 재고목록에는 미표시(상세·구매용)';

-- 5) 재고·실사 담당 파트 — parts(id) 참조 (staff.part_id와 동일 관례)
alter table tb_raw_mst add column manage_part_id uuid references parts(id);
comment on column tb_raw_mst.manage_part_id is '재고·실사 담당 파트(KP/SP 등). parts(id) 참조';

-- 6) 알레르기 표기 — 식약처 22종 + NONE(확인 결과 없음, 미입력과 구분)
alter table tb_raw_mst add column allergen_tags text[] not null default '{}'::text[];
comment on column tb_raw_mst.allergen_tags is '식약처 알레르기 22종 코드 배열. NONE=확인 결과 알레르기 없음(미입력과 구분). 현재 전량 미입력(빈 배열)';

commit;
