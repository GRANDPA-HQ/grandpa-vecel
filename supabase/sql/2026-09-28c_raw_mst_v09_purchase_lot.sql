-- 원재료 마스터 v0.9 — 목표재고(par_stock) 폐기 → 회당 구매량(purchase_lot)
-- 근거: "02.원재료 마스터_TB_RAW_MST_설계서_v0.9" 개발자액션 시트 / 구매발주 운영규칙 v0.2 5-1
-- par_stock 값 0/132건이라 백업·이관 없음.
--
-- Supabase SQL Editor에서 실행하세요.

BEGIN;

ALTER TABLE tb_raw_mst RENAME COLUMN par_stock TO purchase_lot;
ALTER TABLE tb_raw_mst ADD CONSTRAINT chk_raw_mst_purchase_lot
  CHECK (purchase_lot IS NULL OR purchase_lot > 0);

COMMENT ON COLUMN tb_raw_mst.purchase_lot IS
  '회당 구매량(1로트). 발주 기본 수량, 배수로만 증량. g 저장·개수 표시(개수×count_size). NULL=미설정(발주 불가)';
COMMENT ON COLUMN tb_raw_mst.min_stock IS
  '발주기준. 현재고(g) ≤ min_stock 이면 부족(구매요청 대상). NULL=기준 미설정';
COMMENT ON COLUMN tb_raw_mst.category_code IS
  '카테고리 코드(FK 아님). tb_category_mst category_type=''RAW & PROD'' 기준, 조회 시 타입 스코프 필수';

COMMIT;
