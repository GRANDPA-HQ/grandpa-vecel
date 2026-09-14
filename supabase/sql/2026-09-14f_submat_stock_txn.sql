-- 포장부자재 재고 트랜잭션 테이블 신설 (tb_submat_stock_txn v0.4)
-- 근거: 개발자료/포장부자재/20.재고관리 포장부자재_TB_SUBMAT_STOCK_TXN_설계서_v0.4.xlsx
--
-- 핵심 개념 — 트랜잭션 합산형: 별도 잔량 필드 없이 재고 이동 이벤트를 쌓고 SUM(qty)로
-- 현재고를 산출한다. 저장 단위 = 팩(PACK). qty는 부호 포함 저장(IN=+ / ADJ=± / RETURN_HOLD=−).
--   정상 재고   = SELECT SUM(qty) FROM tb_submat_stock_txn WHERE submat_id=? AND store_id=?
--   반품대기량  = SELECT SUM(-qty) FROM tb_submat_stock_txn WHERE submat_id=? AND store_id=? AND txn_type='RETURN_HOLD'
--   입고 환산   = qty = (input_box × tb_submat_mst.packs_per_box) + input_pack
-- 트랜잭션은 물리 삭제하지 않는다(오입력 정정은 반대 부호의 트랜잭션으로) — 앱 레벨 규칙.
--
-- 선행 확정 사항 (이 세션 이전에 이미 반영됨 — 설계서의 부속결정 D-1/D-2 대응):
--   - D-1: tb_submat_mst 등 4개 테이블의 stock_qty 컬럼 삭제 완료 (2026-09-14_drop_stock_qty.sql)
--   - D-2: staff/employees 이중 테이블 정리 완료 — employees를 staff로 rename 완료
--     (2026-09-14b_rename_employees_to_staff.sql). 아래 created_by는 staff(id)를 직접 참조한다.
--   - 마스터 tb_submat_mst v0.5(qty_per_pack/packs_per_box/min_stock_pack/par_stock_pack) 반영 완료
--     (2026-09-14d_submat_mst_v0.5.sql)
--
-- 이번 마이그레이션 범위: 테이블 생성(DDL)만. RLS 정책(조회는 전 직원 / 입력은 SP 스태프 /
-- 정기실사 매니저 전용 제약 해제)은 설계서상 "예정" 상태로 별도 진행.
--
-- Supabase SQL Editor에서 실행하세요.

create table tb_submat_stock_txn (
  txn_id       uuid primary key default gen_random_uuid(),
  store_id     uuid not null references tb_store_mst(id) on delete restrict,
  submat_id    varchar(30) not null references tb_submat_mst(submat_id) on delete restrict,
  txn_type     varchar(15) not null check (txn_type in ('IN', 'ADJ', 'RETURN_HOLD')),
  qty          integer not null,
  input_box    integer,
  input_pack   integer,
  reason_type  varchar(20) check (reason_type in ('파손', '분실', '기타', '정기실사')),
  reason_memo  text,
  created_by   uuid not null references staff(id) on delete restrict,
  created_at   timestamptz not null default now(),
  -- reason_type은 ADJ 전용 — IN/RETURN_HOLD는 NULL이어야 하고, ADJ는 반드시 값이 있어야 한다
  constraint chk_submat_stock_txn_reason check (
    (txn_type = 'ADJ' and reason_type is not null) or
    (txn_type <> 'ADJ' and reason_type is null)
  )
);

-- 현재고/반품대기량 조회(SUM(qty) WHERE store_id, submat_id[, txn_type])에 쓰이는 인덱스
create index idx_submat_stock_txn_store_submat on tb_submat_stock_txn(store_id, submat_id);
create index idx_submat_stock_txn_created_by on tb_submat_stock_txn(created_by);
