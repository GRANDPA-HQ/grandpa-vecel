-- 지점 구분(scope) 컬럼 추가 + 본사 전용 파트(경영지원/재무회계) 등록
-- 목적: 직원 관리에서 지점 scope가 "store"(매장)면 서비스/키친 파트만, "hq"(본사)면
-- 경영지원/재무회계 파트만 선택 가능하도록 좁히기 위함.

alter table tb_store_mst
  add column if not exists scope text not null default 'store'
    check (scope in ('store', 'hq'));

-- 기존 지점은 전부 실제 매장이므로 scope='store' 기본값 그대로 둔다 (본사 지점은 아직 없음 — 나중에 추가).

insert into parts (code, name_ko, sort_order, is_active)
select v.code, v.name_ko, v.sort_order, true
from (values
  ('MGMT', '경영지원', 3),
  ('FIN',  '재무회계', 4)
) as v(code, name_ko, sort_order)
where not exists (select 1 from parts p where p.code = v.code);
