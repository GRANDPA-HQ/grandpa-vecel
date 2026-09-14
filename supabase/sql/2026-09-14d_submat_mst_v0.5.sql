-- tb_submat_mst 재고구조 재설계 v0.5 (26개 컬럼 → 16개)
-- 근거: 개발자료/포장부자재/04.포장부자재 마스터_TB_SUBMAT_MST_설계서_v0.5.xlsx
-- 재고 실사 단위 문제 → 재고를 '미개봉 팩' 기준으로 통일. 마스터에서 상태값(stock_qty)·발주정보 분리.
--
-- 전제조건: 단가(purchase_price) 82건 사전 백업 완료
-- (GRANDPA_CORE_SUBMAT_단가백업_20260910.xlsx, 서대표 보관) — 백업 확인 후 이 마이그레이션을 실행하세요.
--
-- 이번 세션 범위 밖(별도 세션에서 진행):
--   - 발주(공급처) 마스터 테이블 신설 — 이번에 삭제하는 purchase_* 7개 컬럼 이관처
--   - tb_submat_stock_txn(재고 트랜잭션 테이블) — stock_qty를 대체할 입/출/조정 이력 테이블
--   - qty_per_pack / packs_per_box / min_stock_pack / par_stock_pack 실값 입력 — 서대표가
--     팩 단위로 재편성한 뒤 수동 입력 예정(자동 환산 없음). 이번 마이그레이션은 컬럼만 만든다.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

-- 1) 죽은 컬럼(전량 NULL) + 발주 축으로 이관될 컬럼 삭제
alter table tb_submat_mst drop column order_pack_unit;
alter table tb_submat_mst drop column item_name_short;
alter table tb_submat_mst drop column avg_daily_use_ea;
alter table tb_submat_mst drop column purchase_mode;
alter table tb_submat_mst drop column purchase_section_id;
alter table tb_submat_mst drop column purchase_supplier;
alter table tb_submat_mst drop column purchase_price;
alter table tb_submat_mst drop column purchase_lead_time_day;
alter table tb_submat_mst drop column purchase_moq;
alter table tb_submat_mst drop column delivery_note;
alter table tb_submat_mst drop column qty_per_purchase;

-- 2) 재고 단위: 'EA' 고정 → 'PACK'(미개봉 팩) 기본, 액체류는 'EA'(미개봉 통) 허용
alter table tb_submat_mst alter column base_unit type char(5);
alter table tb_submat_mst alter column base_unit set default 'PACK';
alter table tb_submat_mst add constraint chk_submat_base_unit check (base_unit in ('PACK', 'EA'));

-- 3) EA 기준 재고 컬럼명 → 팩 기준으로 개명 (값은 일단 유지, 팩 재편성 후 서대표가 재입력)
alter table tb_submat_mst rename column min_stock_ea to min_stock_pack;
alter table tb_submat_mst rename column par_stock_ea to par_stock_pack;

-- 4) 신규: 팩/박스 환산 참고값 (서대표가 팩 재편성 후 직접 입력, 그 전까지는 NULL)
alter table tb_submat_mst add column qty_per_pack integer;
alter table tb_submat_mst add column packs_per_box integer;

commit;
