-- 생산품 레시피 Input 테이블 신설 + 기존 데이터 이관 (tb_prod_recipe → tb_prod_recipe_h/i)
-- 근거: 다운로드된 "03-1. 생산품 레시피_TB_PROD_RECIPE_설계서(Header,Input포함)_v0.3.xlsx"
-- 선행조건: 2026-09-21h_prod_recipe_h_create.sql 먼저 실행할 것.
--
-- 컬럼명을 설계서 정본으로 통일: amount→input_qty, unit→input_unit, ingredient_prod_id는
-- input_type='PROD'+prod_id로 흡수. sort_order 컬럼은 두지 않는다(설계 결정: "입력 순서
-- (created_at)=표시 순서" — 대신 이관 시 각 행을 sort_order 순으로 한 행씩 순차 insert해
-- clock_timestamp()로 서로 다른 created_at을 갖게 함으로써 순서를 보존한다).
--
-- 이관 후 기존 tb_prod_recipe는 삭제하지 않고 tb_prod_recipe_legacy로 이름만 바꿔 남긴다
-- (검증 끝나면 서대표가 별도로 DROP). tb_prod_mst.std_batch_qty/yield_rate는 레시피 H로
-- 이관 완료했으므로 삭제한다.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

create table tb_prod_recipe_i (
  recipe_i_id  uuid primary key default gen_random_uuid(),
  recipe_h_id  uuid not null references tb_prod_recipe_h(recipe_h_id) on delete cascade,
  input_type   varchar(10) not null check (input_type in ('RAW', 'PROD')),
  raw_id       uuid references tb_raw_mst(id) on delete restrict,
  prod_id      uuid references tb_prod_mst(id) on delete restrict,
  input_qty    numeric not null,
  input_unit   varchar(10) not null check (input_unit in ('g', 'kg', 'ml', 'L', 'ea')),
  memo         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint chk_prod_recipe_i_input check (
    (input_type = 'RAW' and raw_id is not null and prod_id is null) or
    (input_type = 'PROD' and prod_id is not null and raw_id is null)
  )
);

create index idx_prod_recipe_i_header on tb_prod_recipe_i(recipe_h_id, created_at);

comment on table tb_prod_recipe_i is '레시피 투입 라인. 원재료(RAW) 또는 생산품(PROD) 투입 — 표시 순서는 created_at 기준(별도 정렬 컬럼 없음)';
comment on column tb_prod_recipe_i.input_qty is '투입 수량. 단위는 input_unit';

-- ── 기존 tb_prod_recipe(41행, 12개 prod_id) → recipe_h(version=1)+recipe_i 이관 ──
do $$
declare
  prod record;
  line record;
  new_h_id uuid;
begin
  for prod in select distinct r.prod_id, m.std_batch_qty, m.yield_rate
              from tb_prod_recipe r
              join tb_prod_mst m on m.id = r.prod_id
  loop
    insert into tb_prod_recipe_h (prod_id, version, is_active, std_batch_qty, yield_rate)
    values (prod.prod_id, 1, true, prod.std_batch_qty, prod.yield_rate)
    returning recipe_h_id into new_h_id;

    for line in select * from tb_prod_recipe
                where prod_id = prod.prod_id
                order by sort_order, created_at
    loop
      insert into tb_prod_recipe_i (recipe_h_id, input_type, raw_id, prod_id, input_qty, input_unit, memo, created_at, updated_at)
      values (
        new_h_id,
        case when line.ingredient_prod_id is not null then 'PROD' else 'RAW' end,
        line.raw_id,
        line.ingredient_prod_id,
        line.amount,
        line.unit,
        line.memo,
        clock_timestamp(),
        clock_timestamp()
      );
    end loop;
  end loop;
end $$;

-- 원본 보존(롤백 안전장치) — 검증 후 서대표가 별도로 DROP
alter table tb_prod_recipe rename to tb_prod_recipe_legacy;

-- 레시피 H로 이관 완료된 필드 삭제
alter table tb_prod_mst drop column std_batch_qty;
alter table tb_prod_mst drop column yield_rate;

-- tb_prod_log.recipe_h_id — 2026-09-21d에서 FK 없이 만들어둔 컬럼에 이제 제약 추가
alter table tb_prod_log add constraint fk_prod_log_recipe_h
  foreign key (recipe_h_id) references tb_prod_recipe_h(recipe_h_id) on delete set null;

commit;

-- ── 검증 쿼리(COMMIT 후 확인용) ──
-- select count(*) from tb_prod_recipe_h;                      -- 12
-- select count(*) from tb_prod_recipe_i;                      -- 41
-- select count(*) from tb_prod_recipe_legacy;                 -- 41 (원본 보존 확인)
