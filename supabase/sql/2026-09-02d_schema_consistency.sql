-- 마스터 테이블 스키마 일관성 정리 (PK 방식 항목은 고위험이라 보류, 나머지만 진행)
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.

-- 1) 활성여부 필드 통일 → is_active boolean (5개 테이블)
alter table tb_raw_mst add column is_active boolean not null default true;
update tb_raw_mst set is_active = (active = 'active');
alter table tb_raw_mst drop column active;

alter table tb_prod_mst add column is_active boolean not null default true;
update tb_prod_mst set is_active = (active = 'active');
alter table tb_prod_mst drop column active;

alter table tb_category_mst add column is_active boolean not null default true;
update tb_category_mst set is_active = (active = 'active');
alter table tb_category_mst drop column active;

alter table tb_submat_mst add column is_active boolean not null default true;
update tb_submat_mst set is_active = (active_yn = 'Y');
alter table tb_submat_mst drop column active_yn;

alter table tb_submat_category_mst add column is_active boolean not null default true;
update tb_submat_category_mst set is_active = (active_yn = 'Y');
alter table tb_submat_category_mst drop column active_yn;

-- 2) purchase_unit 명칭 충돌 해소 — 포장부자재 쪽("발주 묶음 단위")만 이름 변경.
--    원재료(tb_raw_mst.purchase_unit, "재고관리 단위")는 그대로 유지.
alter table tb_submat_mst rename column purchase_unit to order_pack_unit;

-- 3) 사진 필드명 통일 → photo_urls (tb_submat_mst.photo_urls, tb_asset_type_mst.photo_urls는 이미 동일해 변경 없음)
alter table tb_raw_mst rename column photo to photo_urls;
alter table tb_sku_mst rename column photo_url to photo_urls;

-- 4) 메모/비고 필드명 통일 → note (실사용 기준 다수 컨벤션; tb_raw_mst/tb_prod_mst/tb_asset_mst는 이미 note라 변경 없음)
--    tb_submat_mst.usage_note / remark는 2개로 분리된 별개 필드라 이번 범위에서 제외 — 그대로 유지.
alter table tb_zone_mst rename column memo to note;
alter table tb_sku_mst rename column memo to note;

-- 5) 직원 계열 마스터(parts/positions/ranks/employees)에 누락된 updated_at 추가
--    이 앱은 updated_at을 DB 트리거가 아니라 각 서버 액션이 쓸 때 직접 채우는 방식이라 트리거는 만들지 않음.
alter table parts add column updated_at timestamptz not null default now();
alter table positions add column updated_at timestamptz not null default now();
alter table ranks add column updated_at timestamptz not null default now();
alter table employees add column updated_at timestamptz not null default now();
