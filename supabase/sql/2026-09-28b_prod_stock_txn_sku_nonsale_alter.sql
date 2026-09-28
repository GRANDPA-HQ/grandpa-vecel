-- tb_prod_stock_txn 제약 확장 3건 — 판매 외 소진(SKU_NONSALE) CONSUME 허용
-- 근거: "24.재고관리_판매품_판매외 소진_TB_SKU_NONSALE_LOG_설계서_v0.2.xlsx" §개발자 액션 아이템 2
-- 선행조건: 2026-09-28_sku_nonsale_log_create.sql (tb_sku_nonsale_log 신설) 먼저 실행할 것.
--
-- ① ref_type 허용값에 'SKU_NONSALE' 추가
-- ② CONSUME이 허용하는 ref_type에 'SKU_NONSALE' 추가
-- ③ qty 부호 규칙 완화 — CONSUME은 원칙 qty<0이지만, ref_type='SKU_NONSALE'인 경우만
--    qty>0(취소 역분개)도 허용한다.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

alter table tb_prod_stock_txn drop constraint tb_prod_stock_txn_ref_type_check;
alter table tb_prod_stock_txn add constraint tb_prod_stock_txn_ref_type_check
  check (ref_type is null or ref_type in ('PROD_LOG', 'SKU', 'PROD', 'SKU_NONSALE'));

alter table tb_prod_stock_txn drop constraint chk_prod_stock_txn_ref;
alter table tb_prod_stock_txn add constraint chk_prod_stock_txn_ref check (
  (txn_type = 'PRODUCE' and (ref_type is null or ref_type = 'PROD_LOG')) or
  (txn_type = 'CONSUME' and (ref_type is null or ref_type in ('SKU', 'PROD', 'SKU_NONSALE'))) or
  (txn_type in ('ADJ', 'WASTE') and ref_type is null and ref_id is null)
);

alter table tb_prod_stock_txn drop constraint chk_prod_stock_txn_qty_sign;
alter table tb_prod_stock_txn add constraint chk_prod_stock_txn_qty_sign check (
  (txn_type = 'PRODUCE' and qty > 0) or
  (txn_type = 'CONSUME' and ref_type = 'SKU_NONSALE' and qty <> 0) or
  (txn_type = 'CONSUME' and (ref_type is null or ref_type <> 'SKU_NONSALE') and qty < 0) or
  (txn_type = 'WASTE' and qty < 0) or
  (txn_type = 'ADJ')
);

commit;
