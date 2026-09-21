-- tb_prod_mst 재고구조 정비 (v0.4)
-- 근거: 다운로드된 "생산품목마스터_TB_PROD_MST_설계서_v0.4.xlsx" /
--       "GRANDPA_CORE_생산품마스터원재료오분류정리요청_v1.0.xlsx"
--
-- ⚠️ 라이브 스키마 확인 결과 이번 마이그레이션에서 하지 않는 것:
--   - std_batch_qty / yield_rate 컬럼 삭제: 설계서는 이 값들을 tb_prod_recipe_h로 이관 후
--     삭제하라고 하지만, 레시피 Header+Input 재편 설계서("03-1...v0.3")가 아직 없어(다운로드
--     폴더 확인됨) 이관할 테이블이 없다. 값 손실을 막기 위해 이번엔 그대로 둔다. 재편 세션에서 이관·삭제.
--   - category_code FK/스코프 제약: tb_prod_mst 126건 중 원재료성 오분류 품목 34건이 아직
--     서대표 판정 전이다(정리대상 목록의 ▶판정 칸 공란 확인됨). 오분류 데이터가 남은 채 제약을
--     걸면 생성 자체가 실패하고, 어떤 품목을 원재료로 전환할지는 사람의 판단 영역이라 자동화하지
--     않는다. 정리 완료 후 별도 마이그레이션으로 다음을 적용할 것:
--       alter table tb_prod_mst add constraint uq_category_scope_prod
--         foreign key (category_code, category_type) references tb_category_mst(category_code, category_type);
--       (category_type 컬럼을 'RAW & PROD' 고정값으로 추가하거나, tb_category_mst에
--        unique(category_code, category_type)을 먼저 걸어야 함 — 정리 세션에서 확정)
--   - legacy_ing_code 컬럼: 설계서 자체가 "삭제 예정"이라 표시한 마이그레이션 추적용 컬럼이라
--     새로 만들 실익이 없어 추가하지 않는다.
--
-- 라이브 확인 사실:
--   - status 값(UNPROC/COOK/PREP/SEMI)이 설계서 prod_stage와 완전히 동일 → 순수 개명.
--   - owner_part는 126행 전부 NULL(죽은 컬럼, 설계서에도 없음) → 삭제.
--   - tb_asset_mst는 존재하며 PK는 asset_id(not id).
--
-- 함께 고칠 코드: app/dashboard/production-write/page.tsx, app/dashboard/prod-recipe-write/page.tsx
-- (컬럼명 status/storage를 직접 참조) — 이 SQL과 같은 PR에서 반영.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

-- 1) 개명: 실물 컬럼을 설계서 정본 이름으로
alter table tb_prod_mst rename column status to prod_stage;
alter table tb_prod_mst rename column storage to storage_type;
alter table tb_prod_mst rename column note to memo;

-- 2) 죽은 컬럼 삭제 (전량 NULL 확인됨)
alter table tb_prod_mst drop column owner_part;

-- 3) 신규 컬럼 — 저장형태·규격 (실사용, 서대표가 값 채울 때까지 nullable)
alter table tb_prod_mst add column stock_form varchar(10);
alter table tb_prod_mst add constraint chk_prod_mst_stock_form check (stock_form is null or stock_form in ('통', '팩'));
alter table tb_prod_mst add column unit_size numeric;
alter table tb_prod_mst add column unit_size_uom varchar(10);
alter table tb_prod_mst add constraint chk_prod_mst_unit_size_uom check (unit_size_uom is null or unit_size_uom in ('g', '개'));
comment on column tb_prod_mst.stock_form is '보관 재고 저장형태. 실사 입력방식·규격해석 기준. NULL=미지정';
comment on column tb_prod_mst.unit_size is '묶음(통/팩) 1개당 내용량. 실사 = 묶음 수 × unit_size = 대략의 현재고';
comment on column tb_prod_mst.unit_size_uom is 'unit_size 단위. 통=g, 팩=g 또는 개(포션 수)';

-- 4) 신규 컬럼 — 기본 보관 시설(선택)
alter table tb_prod_mst add column default_storage_asset_id uuid references tb_asset_mst(asset_id);

-- 5) FK 선행조건: prod_code UNIQUE (tb_prod_log · tb_prod_stock_txn이 참조)
alter table tb_prod_mst add constraint uq_prod_mst_prod_code unique (prod_code);

commit;
