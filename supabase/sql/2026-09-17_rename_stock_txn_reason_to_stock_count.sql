-- tb_submat_stock_txn.reason_type 값 이름 변경: '정기실사' → '재고 실사'
-- 근거: 화면 문구를 "정기실사"에서 "재고 실사"로 통일 (사이드바/재고 화면 라벨 변경에 맞춤,
-- app/actions/submat-stock.ts의 실사 확정 로직도 함께 수정).
-- 기존에 저장된 이력(tb_submat_stock_txn.reason_type='정기실사')도 새 값으로 백필한다.
--
-- Supabase SQL Editor에서 실행하세요.

-- 1) 기존 값 목록('파손','분실','기타','정기실사')을 검사하던 check 제약 제거.
--    2026-09-14f_submat_stock_txn.sql에서 이름을 지정하지 않고 만들어 실제 이름이
--    환경마다 다를 수 있으므로, 이름 대신 제약 정의 내용('정기실사' 포함 여부)으로 찾아 제거한다.
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'tb_submat_stock_txn'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%정기실사%'
  loop
    execute format('alter table tb_submat_stock_txn drop constraint %I', con.conname);
  end loop;
end $$;

-- 2) 기존 이력 백필
update tb_submat_stock_txn
set reason_type = '재고 실사'
where reason_type = '정기실사';

-- 3) 새 값 목록으로 check 제약 재생성 (이후에는 이름이 고정되어 관리하기 쉬움)
alter table tb_submat_stock_txn
  add constraint tb_submat_stock_txn_reason_type_check
  check (reason_type in ('파손', '분실', '기타', '재고 실사'));
