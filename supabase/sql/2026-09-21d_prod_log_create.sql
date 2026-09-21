-- 생산 로그 테이블 신설 (tb_prod_log v0.1)
-- 근거: 다운로드된 "생산품목_TB_PROD_LOG_설계서_v0.1.xlsx"
-- 선행조건: 2026-09-21c_prod_mst_v0.4.sql (prod_code UNIQUE 제약) 먼저 실행할 것.
--
-- 핵심 개념: 생산 완료 기록을 남기는 "이벤트 원장". 재고 증감(생산품 재고 +)은 별도인
-- tb_prod_stock_txn(합산형 원장)에서 관리한다 — 저장 흐름: 작업자 줄 → 로그 1행 → 재고
-- 원장에 PRODUCE 1행(ref_type='PROD_LOG', ref_id=log_id).
--
-- ⚠️ recipe_h_id는 FK 없이 nullable uuid로만 만든다 — tb_prod_recipe_h(레시피 Header) 테이블이
-- 아직 없다(재편 설계서 "03-1...v0.3" 도착 후 별도 세션). 그 세션에서 FK 제약을 추가할 것:
--   alter table tb_prod_log add constraint fk_prod_log_recipe_h
--     foreign key (recipe_h_id) references tb_prod_recipe_h(recipe_h_id) on delete set null;
--
-- Supabase SQL Editor에서 실행하세요.

create table tb_prod_log (
  log_id       uuid primary key default gen_random_uuid(),
  store_id     uuid not null references tb_store_mst(id) on delete restrict,
  prod_code    varchar(30) not null references tb_prod_mst(prod_code) on delete restrict,
  recipe_h_id  uuid,
  worker_id    uuid not null references staff(id) on delete restrict,
  output_qty   numeric not null check (output_qty > 0),
  labor_min    integer not null check (labor_min > 0),
  memo         text,
  created_by   uuid not null references staff(id) on delete restrict,
  created_at   timestamptz not null default now()
);

-- 품목별 생산일지 조회(prod_code, store_id, created_at)에 쓰이는 인덱스
create index idx_prod_log_prod_store on tb_prod_log(prod_code, store_id, created_at desc);
create index idx_prod_log_worker on tb_prod_log(worker_id);
create index idx_prod_log_created_by on tb_prod_log(created_by);

comment on table tb_prod_log is '생산 완료 기록(이벤트 원장). 작업자 줄 하나 = 1행. 재고 증감은 tb_prod_stock_txn 소관';
comment on column tb_prod_log.recipe_h_id is '적용 레시피. 레시피 있는 품목만, 미등록은 NULL. FK는 tb_prod_recipe_h 신설 후 추가 예정';
comment on column tb_prod_log.worker_id is '작업자(실적 귀속). 근무 중 직원 중 선택, 기본값=PIN 직원';
comment on column tb_prod_log.output_qty is '생산 산출량(품목 base 단위: g·ml·ea). 공동생산은 작업자별 분할(합=총생산량)';
comment on column tb_prod_log.labor_min is '실제 작업(노동)시간(분)';
comment on column tb_prod_log.created_by is '입력자(세션 PIN 직원). worker_id와 별개';
