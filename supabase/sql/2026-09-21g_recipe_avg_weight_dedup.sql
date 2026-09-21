-- 레시피 테이블의 avg_weight 컬럼 중복 제거
-- 근거: 사용자 확정 사항 — "avg_weight 정본 = tb_prod_mst 단일. 개당 중량은 생산품 고유
-- 물리속성(삶은달걀·포션류 1개 무게)이라 마스터에 하나만 둔다. 레시피·판매품이 ea로
-- 투입·판매할 때는 마스터 값을 조인해서 쓴다."
--
-- 라이브 확인: tb_prod_recipe·tb_sku_recipe 양쪽 다 avg_weight 값을 가진 행이 0건이라
-- 데이터 손실 없이 삭제 가능. app/actions/prod-recipe.ts·app/actions/sku-recipe.ts에
-- 이미 "avg_weight 컬럼이 없으면 그 필드를 빼고 재시도"하는 폴백이 있어 이 컬럼을 지워도
-- 코드 수정 없이 그대로 동작한다(단, 저장 시 마스터의 avg_weight를 참고하도록 조회부는
-- 이미 tb_prod_mst.avg_weight를 우선 조인하고 있는지 화면 쪽에서 별도 확인 필요).
--
-- Supabase SQL Editor에서 실행하세요.

begin;

alter table tb_prod_recipe drop column avg_weight;
alter table tb_sku_recipe drop column avg_weight;

commit;
