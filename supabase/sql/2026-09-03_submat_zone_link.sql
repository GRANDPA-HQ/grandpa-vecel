-- 포장 부자재(tb_submat_mst) 화면의 "존" 태그 기능이 참조하는 다대다 연결 테이블.
-- 코드(app/actions/submat-zone.ts, lib/supabase/db.ts)는 이 테이블이 있다는 전제로 이미 작성돼 있었지만
-- 실제 DB에는 생성된 적이 없어, 존을 추가하려고 하면
-- "Could not find the table 'public.tb_submat_zone_link' in the schema cache" 오류가 발생했음.
-- Supabase SQL Editor에서 실행하세요.

create table if not exists tb_submat_zone_link (
  submat_id     character varying not null references tb_submat_mst(submat_id) on delete cascade,
  zone_type_id  uuid not null references tb_zone_type_mst(zone_type_id) on delete cascade,
  created_at    timestamp with time zone not null default now(),
  primary key (submat_id, zone_type_id)
);

alter table tb_submat_zone_link enable row level security;

-- 로그인한 사용자는 모두 조회/등록/해제 가능 (다른 마스터 테이블과 동일한 수준의 개방 정책)
create policy "submat_zone_link_select" on tb_submat_zone_link
  for select to authenticated using (true);

create policy "submat_zone_link_insert" on tb_submat_zone_link
  for insert to authenticated with check (true);

create policy "submat_zone_link_delete" on tb_submat_zone_link
  for delete to authenticated using (true);
