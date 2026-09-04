-- 데이터 테이블 뷰어(원재료/생산품/SKU/지점 등) 인라인 수정·추가·삭제 이력을 남기는 감사 로그.
-- 직원이 실수로 값을 바꾸거나 행을 지웠을 때 이전 값을 확인하고 되돌릴 수 있도록 하기 위함.
-- 롤백 UI는 아직 없음 — 이번엔 로그 적재만. old_value/new_value에 되돌리는 데 필요한 값을 다 담아둔다.

create table tb_audit_log (
  id              uuid primary key default gen_random_uuid(),
  table_name      text not null,
  pk_column       text not null,
  pk_value        text not null,
  action          text not null check (action in ('insert', 'update', 'delete')),
  -- update(셀 하나 수정)일 때만 값이 있음. insert/delete는 행 전체를 old_value/new_value에 담으므로 null.
  column_name     text,
  -- update: 이전 셀 값. delete: 삭제된 행 전체. insert: 사용 안 함(null).
  old_value       jsonb,
  -- update: 새 셀 값. insert: 생성된 행 전체(생성된 PK 포함). delete: 사용 안 함(null).
  new_value       jsonb,
  -- 나중에 이 직원이 삭제/변경되어도 당시 이름을 그대로 남기기 위해 이름도 스냅샷으로 같이 저장.
  changed_by      uuid references employees(id),
  changed_by_name text,
  changed_at      timestamptz not null default now()
);

create index idx_audit_log_table_pk on tb_audit_log(table_name, pk_value, changed_at desc);
create index idx_audit_log_changed_at on tb_audit_log(changed_at desc);
