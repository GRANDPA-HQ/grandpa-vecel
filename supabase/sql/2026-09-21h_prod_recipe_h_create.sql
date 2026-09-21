-- 생산품 레시피 Header 테이블 신설 (tb_prod_recipe_h)
-- 근거: 다운로드된 "03-1. 생산품 레시피_TB_PROD_RECIPE_설계서(Header,Input포함)_v0.3.xlsx"
--
-- tb_prod_recipe(단일 테이블)를 Header+Input 2단으로 재편하는 첫 단계. std_batch_qty(표준배치량)·
-- yield_rate(기준수율)·리드타임·std_labor_min(적정 작업시간, 분)을 레시피 "버전" 단위로 관리한다.
-- version(정수)+is_active(현행 여부)로 이력을 남긴다 — 변경 시 기존 활성 버전을 false로 바꾸고
-- 새 버전을 insert(물리 UPDATE/DELETE 없음, tb_raw_stock_txn 등과 같은 불변 이력 원칙).
--
-- prod_id는 설계서 표기(TB_PROD_MST.prod_id)와 달리 라이브 tb_prod_mst의 실제 PK인 id(uuid)를
-- 참조한다(tb_prod_recipe.prod_id가 이미 이 관례를 쓰고 있음).
--
-- Supabase SQL Editor에서 실행하세요.

create table tb_prod_recipe_h (
  recipe_h_id       uuid primary key default gen_random_uuid(),
  prod_id           uuid not null references tb_prod_mst(id) on delete restrict,
  version           integer not null check (version >= 1),
  is_active         boolean not null default true,
  std_batch_qty     numeric,
  yield_rate        integer,
  lead_time_days    integer,
  lead_time_hours   integer,
  lead_time_minutes integer,
  std_labor_min     integer,
  memo              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint uq_prod_recipe_h_version unique (prod_id, version)
);

-- 생산품당 활성(is_active=true) 버전은 1개만 — 부분 유니크 인덱스로 강제
create unique index uq_prod_recipe_h_active on tb_prod_recipe_h(prod_id) where is_active;

create index idx_prod_recipe_h_prod on tb_prod_recipe_h(prod_id);

comment on table tb_prod_recipe_h is '생산품 레시피 헤더. prod_id당 버전(version)별 이력, is_active=현행 여부(1개만 true)';
comment on column tb_prod_recipe_h.std_batch_qty is '1회 표준 생산량. 단위=tb_prod_mst.unit 기준';
comment on column tb_prod_recipe_h.yield_rate is '기준수율(%). 수동 입력(목표치) — 실제 수율은 생산 로그에서 별도 산출';
comment on column tb_prod_recipe_h.std_labor_min is '적정 작업시간(분). 표준 노동시간. lead_time(경과시간)과 별개. 생산 기록의 실제 작업시간(labor_min)과 비교용, 화면엔 참고 표기만';
