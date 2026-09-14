-- 존(zone) 정본은 tb_zone_mst(40행, 이 앱 전역에서 사용 중)로 확정.
-- zones(34행)는 이 저장소의 코드/SQL 이력 어디에도 참조가 없는 미사용 중복 테이블이라 폐기한다.
--
-- assets.fk_assets_zone, sop_steps.fk_sop_steps_zone이 zones를 참조하고 있었으나,
-- assets/sop_steps 역시 코드에서 전혀 참조되지 않는 미사용 테이블로 확인됨
-- (시설/방법서 정본은 각각 tb_asset_mst, tb_sop_mst). CASCADE로 그 FK 제약조건만 제거한다
-- (assets, sop_steps 테이블 자체와 데이터는 남는다 — 제약조건만 삭제됨).
-- Supabase SQL Editor에서 실행하세요.

drop table zones cascade;
