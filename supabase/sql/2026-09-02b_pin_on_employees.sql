-- SP 출퇴근 키오스크 — 키오스크 대상은 별도 명단이 아니라 기존 employees를 그대로 쓰되,
-- PIN 인증 정보는 요구사항대로 employees 마스터와 완전히 분리된 별도 테이블(tb_sp_staff_auth)에 둔다.
-- staff_id가 PK이자 employees(id) 참조 FK라서 employees와 1:1로 조인해서만 쓰인다.
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- 주의: tb_sp_staff_auth/tb_sp_attendance_log/tb_notice_ack를 DROP합니다 — 지금까지 쌓인
-- 테스트 출퇴근 기록·공지 확인 기록이 전부 삭제됩니다(운영 데이터 아님, 테스트 데이터만 있음 확인됨).

drop table if exists tb_notice_ack;
drop table if exists tb_sp_attendance_log;
drop table if exists tb_sp_staff_auth;

-- 직원 인증(PIN) — employees 마스터와 분리된 별도 테이블, staff_id로 employees와 조인
create table tb_sp_staff_auth (
  staff_id    uuid primary key references employees(id) on delete cascade,
  pin_hash    text not null,            -- "salt:hash" (scrypt, hex) — lib/pin.ts가 생성/검증
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 출퇴근 이벤트 로그 (append-only, 상태는 저장하지 않고 매번 파생)
create table tb_sp_attendance_log (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references employees(id),
  store_id    uuid not null references tb_store_mst(id),   -- 매장 스코핑용 비정규화 컬럼
  check_type  text not null check (check_type in ('IN','OUT','BREAK_START','BREAK_END')),
  checked_at  timestamptz not null default now()
);
create index idx_sp_attendance_staff_time on tb_sp_attendance_log(staff_id, checked_at desc);
create index idx_sp_attendance_store_time on tb_sp_attendance_log(store_id, checked_at desc);

-- 공지 확인(ack) — "미확인" = 매장 SP파트 직원 중 이 테이블에 없는 사람
create table tb_notice_ack (
  id          uuid primary key default gen_random_uuid(),
  notice_id   uuid not null references tb_notice(id) on delete cascade,
  staff_id    uuid not null references employees(id),
  acked_at    timestamptz not null default now(),
  unique (notice_id, staff_id)
);
create index idx_notice_ack_notice on tb_notice_ack(notice_id);
