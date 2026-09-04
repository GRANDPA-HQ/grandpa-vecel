-- 재고관리 1차 구현 — 판매품(tb_sku_mst.stock_qty)과 동일한 패턴으로 원재료/생산품/포장부자재에도
-- 단순 재고 수량 컬럼을 추가한다. 지점/존 단위 세분화 없이 전체 1개 수량만 관리하는 1차 버전.
-- Supabase SQL Editor에서 실행하세요.

alter table tb_raw_mst add column stock_qty integer not null default 0;
alter table tb_prod_mst add column stock_qty integer not null default 0;
alter table tb_submat_mst add column stock_qty integer not null default 0;
