-- 재고관리 1차 구현(2026-09-04_inventory_stock_qty.sql)으로 추가했던 stock_qty 컬럼을
-- 4개 마스터 테이블 전부에서 제거한다. 미사용 컬럼이라 판단, 관련 화면/함수도 함께 삭제.
-- Supabase SQL Editor에서 실행하세요.

alter table tb_raw_mst drop column stock_qty;
alter table tb_prod_mst drop column stock_qty;
alter table tb_submat_mst drop column stock_qty;
alter table tb_sku_mst drop column stock_qty;
