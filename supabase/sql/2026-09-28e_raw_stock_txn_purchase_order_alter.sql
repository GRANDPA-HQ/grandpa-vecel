-- 원재료 재고 원장(tb_raw_stock_txn) — 구매발주 입고·반품 연결 (현재 0건)
-- 근거: 구매발주 스키마 확정분(2026-09-26). 입고(IN)는 발주 건을 ref_type='PURCHASE_ORDER',
-- ref_id=order_id로 참조한다(별도 입고 테이블 없음). 구매발주 신규 테이블(설계서 25)은 별도 전달.
--
-- ref_type이 varchar(10)이라 'PURCHASE_ORDER'(14자)가 들어가지 않아 varchar(20)으로 먼저 확장한다.
-- 반품대기(RETURN_HOLD) 해소 = 같은 발주를 참조하는 음수 행 + 결과 코드
-- (REFUND/EXCHANGE/DISCARD/REJECTED, REJECTED는 메모 필수).
-- 반품 사유는 한글 → 영문 코드로 통일: FRESH/DAMAGE/QTY_SHORT/WRONG_ITEM/OTHER
--
-- chk_raw_stock_txn_reason(WASTE·RETURN_HOLD·ADJ는 reason 필수)은 그대로 유지한다.
--
-- Supabase SQL Editor에서 실행하세요.

BEGIN;

ALTER TABLE tb_raw_stock_txn ALTER COLUMN ref_type TYPE varchar(20);

ALTER TABLE tb_raw_stock_txn DROP CONSTRAINT tb_raw_stock_txn_ref_type_check;
ALTER TABLE tb_raw_stock_txn ADD CONSTRAINT tb_raw_stock_txn_ref_type_check
  CHECK (ref_type IS NULL OR ref_type IN ('PROD','SKU','PURCHASE_ORDER'));

ALTER TABLE tb_raw_stock_txn DROP CONSTRAINT chk_raw_stock_txn_ref_only_consume;
ALTER TABLE tb_raw_stock_txn ADD CONSTRAINT chk_raw_stock_txn_ref_scope CHECK (
  (ref_type IS NULL AND ref_id IS NULL)
  OR (txn_type = 'CONSUME' AND ref_type IN ('PROD','SKU'))
  OR (txn_type IN ('IN','RETURN_HOLD') AND ref_type = 'PURCHASE_ORDER' AND ref_id IS NOT NULL)
);

ALTER TABLE tb_raw_stock_txn DROP CONSTRAINT chk_raw_stock_txn_qty_sign;
ALTER TABLE tb_raw_stock_txn ADD CONSTRAINT chk_raw_stock_txn_qty_sign CHECK (
  (txn_type = 'IN' AND qty > 0)
  OR (txn_type IN ('CONSUME','WASTE') AND qty < 0)
  OR (txn_type = 'ADJ')
  OR (txn_type = 'RETURN_HOLD' AND qty > 0
      AND reason_code IN ('FRESH','DAMAGE','QTY_SHORT','WRONG_ITEM','OTHER'))
  OR (txn_type = 'RETURN_HOLD' AND qty < 0
      AND reason_code IN ('REFUND','EXCHANGE','DISCARD','REJECTED'))
);

ALTER TABLE tb_raw_stock_txn DROP CONSTRAINT chk_raw_stock_txn_reason_code;
ALTER TABLE tb_raw_stock_txn ADD CONSTRAINT chk_raw_stock_txn_reason_code CHECK (
  reason_code IS NULL OR reason_code IN (
    'SPOIL','EXPIRE','DROP','OTHER','AUDIT',
    'FRESH','DAMAGE','QTY_SHORT','WRONG_ITEM',
    'REFUND','EXCHANGE','DISCARD','REJECTED')
);

ALTER TABLE tb_raw_stock_txn ADD CONSTRAINT chk_raw_stock_txn_rejected_memo
  CHECK (reason_code IS DISTINCT FROM 'REJECTED' OR reason_memo IS NOT NULL);

COMMIT;
