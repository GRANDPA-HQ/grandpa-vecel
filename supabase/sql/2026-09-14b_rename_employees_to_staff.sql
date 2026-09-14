-- employees(9행, 실사용) 테이블을 staff로 이름 변경한다.
-- DB에 이미 설계만 되고 비어 있는(0행) staff 테이블이 존재해 이름이 충돌하므로,
-- 그 빈 테이블을 먼저 제거한 뒤 employees를 staff로 rename한다.
-- staff_sections.fk_staff_sections_staff가 staff를 참조하고 있으나, staff_sections도 설계만 되고
-- 비어 있는/미사용 테이블로 확인되어 CASCADE로 그 FK 제약조건만 함께 제거한다
-- (staff_sections 테이블 자체와 데이터는 남는다 — 제약조건만 삭제됨).
-- FK(예: tb_sp_staff_auth.staff_id → employees(id))는 Postgres가 테이블 OID로 추적하므로
-- rename 이후에도 그대로 유지된다. 컬럼 구성은 변경하지 않는다.
-- Supabase SQL Editor에서 실행하세요.

drop table if exists staff cascade;

alter table employees rename to staff;

-- 데이터 테이블 뷰어의 열 표시/순서 설정이 이전 테이블명으로 저장돼 있었다면 함께 이전
update table_column_prefs set table_name = 'staff' where table_name = 'employees';
