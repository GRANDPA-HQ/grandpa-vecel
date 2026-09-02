-- SP 출퇴근(PIN 체크인) 키오스크 + 공지 위젯용 신규 테이블
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요. (이 저장소엔 마이그레이션 도구가 없어 수동 실행 필요)

-- 1) SP 직원 로스터 + PIN 인증 (employees와 분리된 별도 명단)
create table tb_sp_staff_auth (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references tb_store_mst(id),
  name        text not null,
  pin_hash    text not null,               -- "salt:hash" (scrypt, hex) — lib/pin.ts가 생성/검증
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_sp_staff_auth_store on tb_sp_staff_auth(store_id) where is_active;

-- 2) 출퇴근 이벤트 로그 (append-only, 상태는 저장하지 않고 매번 파생)
create table tb_sp_attendance_log (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references tb_sp_staff_auth(id),
  store_id    uuid not null references tb_store_mst(id),   -- 매장 스코핑용 비정규화 컬럼
  check_type  text not null check (check_type in ('IN','OUT','BREAK_START','BREAK_END')),
  checked_at  timestamptz not null default now()
);
create index idx_sp_attendance_staff_time on tb_sp_attendance_log(staff_id, checked_at desc);
create index idx_sp_attendance_store_time on tb_sp_attendance_log(store_id, checked_at desc);

-- 3) 공지 (매장 전체 대상만 — 위젯이 실제로 쓰는 타겟팅은 이것뿐)
create table tb_notice (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references tb_store_mst(id),
  title       text not null,
  body        text,
  created_by  uuid references employees(id),
  created_at  timestamptz not null default now()
);
create index idx_notice_store_created on tb_notice(store_id, created_at desc);

-- 4) 공지 확인(ack) — "미확인" = 매장 활성 직원 중 이 테이블에 없는 사람
create table tb_notice_ack (
  id          uuid primary key default gen_random_uuid(),
  notice_id   uuid not null references tb_notice(id) on delete cascade,
  staff_id    uuid not null references tb_sp_staff_auth(id),
  acked_at    timestamptz not null default now(),
  unique (notice_id, staff_id)
);
create index idx_notice_ack_notice on tb_notice_ack(notice_id);
