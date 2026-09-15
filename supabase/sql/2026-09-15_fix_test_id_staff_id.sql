-- "TEST ID"(seozo001@naver.com) 계정의 staff.id/users.id가 실제 Supabase Auth id와 달라
-- 로그인해도 소속 매장을 찾지 못하던 문제 수정 (employees→staff 이름 변경과는 무관한 기존 데이터 불일치).
--
-- 확인된 값:
--   실제 Auth 로그인 id : 4b872242-9171-477b-81bb-d0903a39826b
--   staff/users 테이블 id: e4b25d1c-ac84-4d76-bf8d-147e2af114b1 (잘못됨)
--
-- 1차 시도(단순 UPDATE staff/users만)는 FK 위반으로 실패했다 — 이 잘못된 id를 참조하는 행이
-- tb_sp_staff_auth(PIN) 1건, tb_sp_attendance_log(출퇴근기록) 4건, tb_notice_ack(공지확인) 2건에
-- 실제로 남아있었다(전수 재확인 완료, tb_audit_log·tb_submat_stock_txn엔 없음).
-- staff.id는 세 테이블에서 참조되는 PK라 부모(staff)를 먼저 바꾸면 자식이 옛 id를 참조 중이라 막히고,
-- 자식을 먼저 바꾸면 새 id가 아직 부모에 없어 막힌다 — 그래서 트랜잭션 안에서 세 FK 제약을
-- 잠깐 DEFERRED로 돌려 한 트랜잭션 커밋 시점에만 정합성을 검사하도록 한다.
--
-- 다른 11개 계정은 이번에 전수 대조한 결과 auth id와 staff.id가 전부 정확히 일치했다 — 잘못된 id는
-- 이 계정 하나뿐이다.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

alter table tb_sp_staff_auth alter constraint tb_sp_staff_auth_staff_id_fkey deferrable;
alter table tb_sp_attendance_log alter constraint tb_sp_attendance_log_staff_id_fkey deferrable;
alter table tb_notice_ack alter constraint tb_notice_ack_staff_id_fkey deferrable;

set constraints
  tb_sp_staff_auth_staff_id_fkey,
  tb_sp_attendance_log_staff_id_fkey,
  tb_notice_ack_staff_id_fkey
  deferred;

update staff set id = '4b872242-9171-477b-81bb-d0903a39826b' where id = 'e4b25d1c-ac84-4d76-bf8d-147e2af114b1';
update users set id = '4b872242-9171-477b-81bb-d0903a39826b' where id = 'e4b25d1c-ac84-4d76-bf8d-147e2af114b1';
update tb_sp_staff_auth set staff_id = '4b872242-9171-477b-81bb-d0903a39826b' where staff_id = 'e4b25d1c-ac84-4d76-bf8d-147e2af114b1';
update tb_sp_attendance_log set staff_id = '4b872242-9171-477b-81bb-d0903a39826b' where staff_id = 'e4b25d1c-ac84-4d76-bf8d-147e2af114b1';
update tb_notice_ack set staff_id = '4b872242-9171-477b-81bb-d0903a39826b' where staff_id = 'e4b25d1c-ac84-4d76-bf8d-147e2af114b1';

commit;
