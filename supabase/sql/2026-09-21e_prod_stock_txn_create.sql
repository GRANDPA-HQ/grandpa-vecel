-- 생산품 재고 트랜잭션 테이블 신설 (tb_prod_stock_txn v0.1)
-- 근거: 다운로드된 "재고관리생산품_TB_PROD_STOCK_TXN_설계서_v0.1.xlsx"
-- 선행조건: 2026-09-21c_prod_mst_v0.4.sql (prod_code UNIQUE 제약) 먼저 실행할 것.
--
-- 핵심 개념 — 원재료 tb_raw_stock_txn과 동일한 합산형 불변원장(현재고=SUM(qty), UPDATE·DELETE
-- 금지, 정정=역분개). 차이점: txn_type 4종(PRODUCE/CONSUME/ADJ/WASTE) — 자체 생산이라
-- RETURN_HOLD(입고검수 반품)는 없다. 저장 단위 = tb_prod_mst.unit 기준 base(g·ml·ea).
-- PRODUCE는 생산 로그(tb_prod_log)의 각 행에서 1건씩 생성된다(ref_type='PROD_LOG', ref_id=log_id).
--
-- Supabase SQL Editor에서 실행하세요.

create table tb_prod_stock_txn (
  txn_id         uuid primary key default gen_random_uuid(),
  store_id       uuid not null references tb_store_mst(id) on delete restrict,
  prod_code      varchar(30) not null references tb_prod_mst(prod_code) on delete restrict,
  txn_type       varchar(15) not null check (txn_type in ('PRODUCE', 'CONSUME', 'ADJ', 'WASTE')),
  qty            numeric not null,
  reason_code    varchar(20),
  reason_memo    text,
  ref_type       varchar(10) check (ref_type is null or ref_type in ('PROD_LOG', 'SKU', 'PROD')),
  ref_id         varchar(40),
  audit_batch_id uuid,
  created_by     uuid not null references staff(id) on delete restrict,
  created_at     timestamptz not null default now(),

  -- 부호 규칙: PRODUCE(+) / CONSUME(−) / WASTE(−) / ADJ(±)
  constraint chk_prod_stock_txn_qty_sign check (
    (txn_type = 'PRODUCE' and qty > 0) or
    (txn_type = 'CONSUME' and qty < 0) or
    (txn_type = 'WASTE' and qty < 0) or
    (txn_type = 'ADJ')
  ),
  -- reason_code는 WASTE/ADJ에서만 값이 있고, PRODUCE/CONSUME은 NULL이어야 한다
  constraint chk_prod_stock_txn_reason check (
    (txn_type in ('WASTE', 'ADJ') and reason_code is not null) or
    (txn_type in ('PRODUCE', 'CONSUME') and reason_code is null)
  ),
  constraint chk_prod_stock_txn_reason_code check (
    reason_code is null or reason_code in ('SPOIL', 'EXPIRE', 'DROP', 'OTHER', 'AUDIT')
  ),
  -- ref_type/ref_id는 PRODUCE(→PROD_LOG)·CONSUME(→SKU/PROD)에서만 사용
  constraint chk_prod_stock_txn_ref check (
    (txn_type = 'PRODUCE' and (ref_type is null or ref_type = 'PROD_LOG')) or
    (txn_type = 'CONSUME' and (ref_type is null or ref_type in ('SKU', 'PROD'))) or
    (txn_type in ('ADJ', 'WASTE') and ref_type is null and ref_id is null)
  )
);

-- 현재고 조회(SUM(qty) WHERE store_id, prod_code)에 쓰이는 인덱스
create index idx_prod_stock_txn_store_prod on tb_prod_stock_txn(store_id, prod_code);
create index idx_prod_stock_txn_recent on tb_prod_stock_txn(prod_code, store_id, created_at desc);
create index idx_prod_stock_txn_audit on tb_prod_stock_txn(audit_batch_id) where audit_batch_id is not null;
create index idx_prod_stock_txn_created_by on tb_prod_stock_txn(created_by);

comment on table tb_prod_stock_txn is '생산품 재고 트랜잭션(합산형 불변원장). 현재고=SUM(qty). UPDATE/DELETE 금지, 정정=역분개. RETURN_HOLD 없음(자체 생산)';
comment on column tb_prod_stock_txn.qty is '증감(부호 포함). PRODUCE+/CONSUME-/ADJ±/WASTE-. 단위=tb_prod_mst.unit 기준 base(g·ml·ea)';
comment on column tb_prod_stock_txn.ref_type is 'PRODUCE 출처=PROD_LOG(생산 로그) / CONSUME 출처=SKU(판매)·PROD(상위 생산품 투입)';
comment on column tb_prod_stock_txn.ref_id is 'PRODUCE=tb_prod_log.log_id(논리 참조, FK 미설정) / CONSUME=판매·상위생산 id';
comment on column tb_prod_stock_txn.audit_batch_id is '한 실사 저장의 WASTE+ADJ 묶음(이중계상 추적). 실사 외에는 NULL';
