-- tb_raw_mst 구매(발주) 컬럼 10개 삭제 — 원 설계서(TB_RAW_MST_migration_v06_to_v08.sql) 단계
-- 근거: "02.원재료 마스터_TB_RAW_MST_설계서_v0.8.xlsx" §2 변경대조표
--   purchase_qty / purchase_price / price_per_unit / supplier / purchase_section_id /
--   buy_link / brand / origin / lead_time_days / purchase_mode → 전부 삭제, 별도 발주(공급처)
--   테이블로 이관 예정(그 테이블은 아직 미설계 — 별도 세션).
--
-- ⚠️ 실행 전 필독: purchase_price(78/132)·supplier(116/132)·buy_link(82/132)·brand(119/132)에
-- 실데이터가 있었다. 삭제 전 raw_code로 매칭한 백업을 이미 만들어뒀다:
--   Downloads/GRANDPA_CORE_RAW_구매백업_20260921.xlsx (132행, 원 설계서가 요구한 백업 형식)
-- 나머지 6개(purchase_qty/price_per_unit/purchase_section_id/origin/lead_time_days/
-- purchase_mode)는 이미 없거나(5개) 전량 NULL(origin)이라 백업 대상이 아니다.
-- 발주 테이블이 생기면 이 백업 파일을 raw_code로 매칭해 이관할 것.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

alter table tb_raw_mst drop column if exists purchase_qty;
alter table tb_raw_mst drop column if exists purchase_price;
alter table tb_raw_mst drop column if exists price_per_unit;
alter table tb_raw_mst drop column if exists supplier;
alter table tb_raw_mst drop column if exists purchase_section_id;
alter table tb_raw_mst drop column if exists buy_link;
alter table tb_raw_mst drop column if exists brand;
alter table tb_raw_mst drop column if exists origin;
alter table tb_raw_mst drop column if exists lead_time_days;
alter table tb_raw_mst drop column if exists purchase_mode;

commit;
