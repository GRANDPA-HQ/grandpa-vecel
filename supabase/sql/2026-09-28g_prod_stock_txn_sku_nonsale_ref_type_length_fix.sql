-- 생산품 재고 원장(tb_prod_stock_txn) — 판매 외 소진 연결 보완 (설계서 24 개발자액션 2번 재적용)
-- 근거: "24.재고관리_판매품_TB_SKU_NONSALE_LOG_설계서_v0.2" 개발자액션 2번.
--
-- 2026-09-28b_prod_stock_txn_sku_nonsale_alter.sql에서 이미 제약 3건은 SKU_NONSALE을 허용하도록
-- 바꿔뒀지만, ref_type이 varchar(10)이라 'SKU_NONSALE'(11자)이 실제로는 컬럼 길이에 걸려 INSERT가
-- 거부되는 문제가 있었다(제약조건 값에는 넣었지만 컬럼 길이 확장을 빠뜨림). 이번에 varchar(20)으로
-- 확장하고, 3건 제약을 최종 문구로 다시 적용한다(원재료 원장과 같은 길이).
--
-- 판매 외 소진 등록 = CONSUME 음수 행(ref_type='SKU_NONSALE', ref_id=로그 id).
-- 취소 = 부호만 반전한 CONSUME 양수 행(ref_id=취소 행 로그 id). 양수 CONSUME은 판매 외 소진
-- 취소에만 허용한다.
--
-- Supabase SQL Editor에서 실행하세요.

BEGIN;

ALTER TABLE tb_prod_stock_txn ALTER COLUMN ref_type TYPE varchar(20);

-- ① ref_type 값에 SKU_NONSALE 추가
ALTER TABLE tb_prod_stock_txn DROP CONSTRAINT tb_prod_stock_txn_ref_type_check;
ALTER TABLE tb_prod_stock_txn ADD CONSTRAINT tb_prod_stock_txn_ref_type_check
  CHECK (ref_type IS NULL OR ref_type IN ('PROD_LOG','SKU','PROD','SKU_NONSALE'));

-- ② CONSUME 허용 ref_type에 SKU_NONSALE 추가
ALTER TABLE tb_prod_stock_txn DROP CONSTRAINT chk_prod_stock_txn_ref;
ALTER TABLE tb_prod_stock_txn ADD CONSTRAINT chk_prod_stock_txn_ref CHECK (
  (txn_type = 'PRODUCE' AND (ref_type IS NULL OR ref_type = 'PROD_LOG'))
  OR (txn_type = 'CONSUME' AND (ref_type IS NULL OR ref_type IN ('SKU','PROD','SKU_NONSALE')))
  OR (txn_type IN ('ADJ','WASTE') AND ref_type IS NULL AND ref_id IS NULL)
);

-- ③ 부호 규칙 완화: CONSUME 양수는 판매 외 소진 취소(SKU_NONSALE)만
ALTER TABLE tb_prod_stock_txn DROP CONSTRAINT chk_prod_stock_txn_qty_sign;
ALTER TABLE tb_prod_stock_txn ADD CONSTRAINT chk_prod_stock_txn_qty_sign CHECK (
  (txn_type = 'PRODUCE' AND qty > 0)
  OR (txn_type = 'CONSUME' AND qty < 0)
  OR (txn_type = 'CONSUME' AND qty > 0 AND ref_type = 'SKU_NONSALE')
  OR (txn_type = 'WASTE' AND qty < 0)
  OR (txn_type = 'ADJ')
);

COMMIT;
