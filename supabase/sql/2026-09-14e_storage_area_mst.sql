-- 보관영역(재고 실사용) 마스터 및 부자재 매핑 테이블 신설
-- 근거: 개발자료/포장부자재/11. 보관영역 마스터 및 매핑 테이블 설계서_TB_STORAGE_AREA_MST_v1.1.xlsx
-- 보관영역 = 부자재를 실제로 쌓아두는 물리적 구역. 존(tb_zone_mst)과는 별개 개념.
-- 지점별로 자유 생성(전사 공통 정의 없음). 한 부자재는 여러 보관영역에 나뉘어 담길 수 있다(다대다).
--
-- 이번 마이그레이션 범위: 마스터 2테이블 생성만. 부자재↔영역 매핑 UI(스태프 태블릿),
-- 재고 실사 화면은 별도 세션에서 진행.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

-- 보관영역 마스터 — 지점별 정의. 매니저 이상이 등록/수정.
create table tb_storage_area_mst (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references tb_store_mst(id),
  area_name   text not null,
  sort_order  int4 not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_storage_area_mst_store on tb_storage_area_mst(store_id);

-- 부자재 ↔ 보관영역 매핑 — 다대다. 위치(어느 영역에 있는지)만 저장하며, 영역별 수량(팩 수)은
-- 저장하지 않는다. 스태프가 매핑을 관리한다(매핑 UI는 별도 세션에서 구현).
create table tb_submat_storage_area_link (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references tb_storage_area_mst(id) on delete cascade,
  submat_id   text not null references tb_submat_mst(submat_id),
  created_at  timestamptz not null default now(),
  unique (area_id, submat_id)
);

create index idx_submat_storage_area_link_submat on tb_submat_storage_area_link(submat_id);

commit;
