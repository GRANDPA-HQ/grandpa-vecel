-- 공지 작성 시 대상 직책(positions)을 지정할 수 있도록 tb_notice에 컬럼 추가.
-- null이면 기존과 동일하게 매장 SP 파트 전체 대상.
-- Supabase SQL Editor에서 실행하세요 (tb_notice가 이미 존재해야 함 — 2026-09-02_attendance_notice.sql 먼저 실행).

alter table tb_notice add column target_position_id uuid references positions(id);
