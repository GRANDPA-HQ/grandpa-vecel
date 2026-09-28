-- 포장부자재 원장(tb_submat_stock_txn) — 실사 회차(audit_batch_id) 보완
-- 근거: 구매발주 설계 판정 A-3(2026-09-27 확정). 9/26 개발자료 2-2 원장 ALTER에 빠졌던 컬럼을
-- 원재료(tb_raw_stock_txn)·생산품(tb_prod_stock_txn) 원장과 같은 방식(uuid, NULL 허용)으로 보완한다.
-- 구매요청(실사발 AUDIT)이 이 회차를 참조한다.
--
-- 부자재 실사는 영역별로 카운트한 뒤 합산하므로, 영역을 몇 개 돌든 한 번의 실사 저장(화면 방문
-- 세션 전체)이 하나의 회차 id로 묶인다. 실사 외 기록(입고 IN, 수동 조정 등)은 NULL.
--
-- Supabase SQL Editor에서 실행하세요.

BEGIN;

ALTER TABLE tb_submat_stock_txn
  ADD COLUMN IF NOT EXISTS audit_batch_id uuid;

COMMENT ON COLUMN tb_submat_stock_txn.audit_batch_id IS
  '한 실사 저장의 ADJ 묶음(실사 회차). 실사 외에는 NULL';

COMMIT;
