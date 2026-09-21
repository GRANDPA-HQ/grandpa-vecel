-- SKU 카테고리를 tb_category_mst에서 분리 (tb_sku_category_mst 신설)
-- 근거: 다운로드된 "GRANDPA_CORE_생산품마스터원재료오분류정리요청_v1.0.xlsx" §설계 반영
--
-- 문제: tb_category_mst가 category_type='RAW & PROD'(10종)와 'SKU'(8종)를 함께 담고 있는데,
-- BEV·FLR·SDS 3개 코드가 서로 다른 의미로 양쪽에 중복 존재한다(예: BEV = SKU에선
-- "음료 커피류", RAW&PROD에선 "커피·음료 원료"). category_code만으로는 어느 쪽인지
-- 구분할 수 없어 데이터 무결성 위험이 있다 — 재료분류(RAW&PROD)와 판매품 메뉴분류(SKU)
-- 축을 완전히 분리한다.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

create table tb_sku_category_mst (
  category_code    varchar(20) primary key,
  emoji            text,
  category_name_en text,
  category_name_kr text,
  sort_order       integer not null default 0,
  description      text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table tb_sku_category_mst is '판매품(SKU) 메뉴 분류 전용 카테고리 — tb_category_mst(원재료·생산품 전용)와 분리';

-- SKU 8종 이관 (오분류 정리요청서 확인: BEV/GC/SDS/YGF/SDW/BWL/SOUP/FLR)
insert into tb_sku_category_mst (category_code, emoji, category_name_en, category_name_kr, sort_order, description, is_active, created_at, updated_at)
select category_code, emoji, category_name_en, category_name_kr, sort_order, description, is_active, created_at, updated_at
from tb_category_mst
where category_type = 'SKU';

delete from tb_category_mst where category_type = 'SKU';

-- tb_sku_mst.category_code → tb_sku_category_mst.category_code
alter table tb_sku_mst add constraint fk_sku_mst_category
  foreign key (category_code) references tb_sku_category_mst(category_code) on delete restrict;

commit;
