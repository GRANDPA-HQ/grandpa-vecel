-- 포장부자재 재고 원장(tb_submat_stock_txn) — 구매발주 입고 연결 (현재 IN 2건)
-- 근거: 구매발주 스키마 확정분(2026-09-26). 입고(IN)는 발주 건을 ref_type='PURCHASE_ORDER',
-- ref_id=order_id로 참조한다(별도 입고 테이블 없음).
--
-- 부자재는 반품대기를 두지 않는다(불량 팩은 입고 수량에서 빼고 발주 잔량으로 정리)
-- → txn_type에서 RETURN_HOLD 제거.
--
-- Supabase SQL Editor에서 실행하세요.

BEGIN;

ALTER TABLE tb_submat_stock_txn
  ADD COLUMN ref_type varchar(20),
  ADD COLUMN ref_id   varchar(40);
ALTER TABLE tb_submat_stock_txn ADD CONSTRAINT chk_submat_stock_txn_ref CHECK (
  (ref_type IS NULL AND ref_id IS NULL)
  OR (txn_type = 'IN' AND ref_type = 'PURCHASE_ORDER' AND ref_id IS NOT NULL)
);
ALTER TABLE tb_submat_stock_txn DROP CONSTRAINT tb_submat_stock_txn_txn_type_check;
ALTER TABLE tb_submat_stock_txn ADD CONSTRAINT tb_submat_stock_txn_txn_type_check
  CHECK (txn_type IN ('IN','ADJ'));

COMMIT;
