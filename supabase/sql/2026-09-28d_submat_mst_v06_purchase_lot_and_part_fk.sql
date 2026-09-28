-- 포장부자재 마스터 v0.6 — 목표재고(par_stock_pack) 폐기 → 회당 구매량(purchase_lot_pack)
-- + 담당 파트(manage_part_id) varchar('KP'/'SP') → uuid FK(parts.id)로 통일
-- 근거: "04.포장부자재 마스터_TB_SUBMAT_MST_설계서_v0.6" 개발자액션 시트 / 구매발주 운영규칙 v0.2 5-1
--
-- ⚠️ 실행 전 필독: 사전 백업 필수 — submat_id · item_name · par_stock_pack · manage_part_id 전건을
--   GRANDPA_CORE_SUBMAT_목표재고·파트백업_YYYYMMDD.xlsx 로 백업해둘 것(par_stock_pack 82건은
--   목표재고 값이라 이번에 폐기된다. 비활성 2건 포함).
-- min_stock_pack 값은 그대로 둔다(검증은 데이터 트랙).
--
-- Supabase SQL Editor에서 실행하세요.

BEGIN;

-- ① 회당 구매량 (기존 82건은 목표재고 값이라 폐기, 비활성 2건 포함)
ALTER TABLE tb_submat_mst RENAME COLUMN par_stock_pack TO purchase_lot_pack;
UPDATE tb_submat_mst SET purchase_lot_pack = NULL;
ALTER TABLE tb_submat_mst ADD CONSTRAINT chk_submat_mst_purchase_lot_pack
  CHECK (purchase_lot_pack IS NULL OR purchase_lot_pack > 0);

-- ② 담당 파트: varchar 'KP'/'SP' → uuid FK (parts.code로 기계 변환)
ALTER TABLE tb_submat_mst ADD COLUMN manage_part_uuid uuid;
UPDATE tb_submat_mst s SET manage_part_uuid = p.id
  FROM parts p WHERE p.code = s.manage_part_id;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tb_submat_mst WHERE manage_part_uuid IS NULL) THEN
    RAISE EXCEPTION 'manage_part_id 변환 실패 행 존재';
  END IF;
END $$;
ALTER TABLE tb_submat_mst DROP COLUMN manage_part_id;
ALTER TABLE tb_submat_mst RENAME COLUMN manage_part_uuid TO manage_part_id;
ALTER TABLE tb_submat_mst ALTER COLUMN manage_part_id SET NOT NULL;
ALTER TABLE tb_submat_mst ADD CONSTRAINT tb_submat_mst_manage_part_id_fkey
  FOREIGN KEY (manage_part_id) REFERENCES parts(id);

-- ③ 주석
COMMENT ON COLUMN tb_submat_mst.purchase_lot_pack IS
  '회당 구매량(팩). 발주 기본 수량, 배수로만 증량. NULL=미설정(발주 불가)';
COMMENT ON COLUMN tb_submat_mst.min_stock_pack IS
  '발주기준(팩). 현재고 ≤ 값이면 부족(구매요청 대상). NULL=기준 미설정';
COMMENT ON COLUMN tb_submat_mst.manage_part_id IS
  '담당 파트. parts(id) 참조. 발주 담당 파트 판정 기준';
COMMENT ON COLUMN tb_submat_mst.packs_per_box IS
  '1박스당 팩 수(참고값·박스+팩 병기 표시용)';

COMMIT;
