-- 원재료 재고 트랜잭션 테이블 신설 (tb_raw_stock_txn v0.1)
-- 근거: 다운로드된 "21.재고관리 원재료_TB_RAW_STOCK_TXN_설계서_v0.1.xlsx" / "tb_raw_stock_txn_create.sql"
-- 선행조건: 2026-09-21_raw_mst_v0.8.sql (raw_code UNIQUE 제약 추가) 먼저 실행할 것.
--
-- 핵심 개념 — 트랜잭션 합산형(포장부자재 tb_submat_stock_txn과 동일 골격, 단위만 g):
--   별도 잔량 필드 없이 재고 이동 이벤트를 쌓고 SUM(qty)로 현재고를 산출. 저장 단위 = g.
--   정상 사용가능 재고 = SUM(qty) WHERE txn_type IN ('IN','CONSUME','ADJ','WASTE')
--   반품대기량        = SUM(qty) WHERE txn_type = 'RETURN_HOLD'  (별계열, 현재고 불포함)
--   부호 규칙: IN(+) / CONSUME(−) / ADJ(±) / WASTE(−) / RETURN_HOLD(+, 별계열)
--   입고 환산 = qty = input_count × tb_raw_mst.count_size
--   실사 ADJ  = qty = 실물(미개봉개수×count_size) − (계산현재고 − 이번 폐기). WASTE 먼저 기록 → ADJ는 잔여만(이중계상 방지).
-- 포장부자재와의 차이: txn_type 5종(WASTE·CONSUME 별도 타입 추가), input_g(부분 계량 폐기) 컬럼 추가,
--   ref_type/ref_id(CONSUME 출처, 소진엔진 세션에서 사용 예정), audit_batch_id(실사 1회 저장 묶음).
-- 트랜잭션은 물리 삭제하지 않는다(오입력 정정은 반대 부호의 트랜잭션으로) — 앱 레벨 규칙.
--
-- 이번 마이그레이션 범위: 테이블 생성(DDL)만. RLS 정책은 설계서상 "예정" 상태로 별도 진행.
--
-- Supabase SQL Editor에서 실행하세요.

create table tb_raw_stock_txn (
  txn_id         uuid primary key default gen_random_uuid(),
  store_id       uuid not null references tb_store_mst(id) on delete restrict,
  raw_code       varchar(20) not null references tb_raw_mst(raw_code) on delete restrict,
  txn_type       varchar(15) not null check (txn_type in ('IN', 'CONSUME', 'ADJ', 'WASTE', 'RETURN_HOLD')),
  qty            numeric not null,
  input_count    integer,
  input_g        numeric,
  reason_code    varchar(20),
  reason_memo    text,
  ref_type       varchar(10) check (ref_type is null or ref_type in ('PROD', 'SKU')),
  ref_id         varchar(40),
  audit_batch_id uuid,
  created_by     uuid not null references staff(id) on delete restrict,
  created_at     timestamptz not null default now(),

  -- 부호 규칙: IN(+) / CONSUME(−) / WASTE(−) / RETURN_HOLD(+, 별계열) / ADJ(±)
  constraint chk_raw_stock_txn_qty_sign check (
    (txn_type = 'IN' and qty > 0) or
    (txn_type = 'CONSUME' and qty < 0) or
    (txn_type = 'WASTE' and qty < 0) or
    (txn_type = 'RETURN_HOLD' and qty > 0) or
    (txn_type = 'ADJ')
  ),
  -- reason_code는 WASTE/RETURN_HOLD/ADJ에서만 값이 있고, IN/CONSUME은 NULL이어야 한다
  constraint chk_raw_stock_txn_reason check (
    (txn_type in ('WASTE', 'RETURN_HOLD', 'ADJ') and reason_code is not null) or
    (txn_type in ('IN', 'CONSUME') and reason_code is null)
  ),
  constraint chk_raw_stock_txn_reason_code check (
    reason_code is null or reason_code in (
      'SPOIL', 'EXPIRE', 'DROP', 'OTHER',                 -- WASTE
      '신선도불량', '파손', '수량부족', '오배송', '기타',   -- RETURN_HOLD
      'AUDIT'                                              -- ADJ
    )
  ),
  -- ref_type/ref_id는 CONSUME에서만 사용(향후 소진엔진 세션)
  constraint chk_raw_stock_txn_ref_only_consume check (
    txn_type = 'CONSUME' or (ref_type is null and ref_id is null)
  )
);

-- 현재고/반품대기량 조회(SUM(qty) WHERE store_id, raw_code[, txn_type])에 쓰이는 인덱스
create index idx_raw_stock_txn_store_raw on tb_raw_stock_txn(store_id, raw_code);
create index idx_raw_stock_txn_recent on tb_raw_stock_txn(raw_code, store_id, created_at desc);
create index idx_raw_stock_txn_audit on tb_raw_stock_txn(audit_batch_id) where audit_batch_id is not null;
create index idx_raw_stock_txn_created_by on tb_raw_stock_txn(created_by);

comment on table tb_raw_stock_txn is '원재료 재고 트랜잭션(합산형 불변원장). 현재고=SUM(qty), 단위 g. UPDATE/DELETE 금지, 정정=역분개';
comment on column tb_raw_stock_txn.qty is 'g, 부호 포함. IN+/CONSUME-/ADJ±/WASTE-/RETURN_HOLD+(별계열)';
comment on column tb_raw_stock_txn.input_count is '입력 원본 — 개수(IN 정상입고/RETURN_HOLD/WASTE 통째/ADJ 실물 미개봉개수). qty = input_count × tb_raw_mst.count_size';
comment on column tb_raw_stock_txn.input_g is '입력 원본 — g 계량(WASTE 개봉·부분폐기 대응)';
comment on column tb_raw_stock_txn.reason_code is 'WASTE(SPOIL/EXPIRE/DROP/OTHER) · RETURN_HOLD(신선도불량 외) · ADJ(AUDIT). IN/CONSUME은 NULL';
comment on column tb_raw_stock_txn.ref_type is 'CONSUME 출처: PROD(생산)/SKU(판매). 소진엔진 세션에서 사용 예정, 현재 미사용';
comment on column tb_raw_stock_txn.audit_batch_id is '한 실사 저장의 WASTE+ADJ 묶음(이중계상 추적). 실사 외에는 NULL';
