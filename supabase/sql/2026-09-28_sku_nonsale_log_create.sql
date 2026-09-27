-- 판매 외 소진 기록 테이블 신설 (tb_sku_nonsale_log v0.2)
-- 근거: 다운로드된 "24.재고관리_판매품_판매외 소진_TB_SKU_NONSALE_LOG_설계서_v0.2.xlsx"
-- 선행조건: tb_store_mst · staff · tb_sku_mst · tb_sku_recipe · tb_prod_mst(prod_code UNIQUE) ·
--   tb_prod_stock_txn(2026-09-21e) 존재. 이 파일 다음에 2026-09-28b(제약 확장 3건)를 실행할 것.
--
-- 핵심 개념 — 판매품은 자체 재고가 없다(판매품 재고관리 모듈 없음). 판매 과정(SP)에서 판매가
-- 아닌 사유로 나간 판매품(제조실수·클레임 재제조·서비스·기타)을 기록하는 이벤트 로그.
-- 저장 흐름: 입력 1건 → 본 로그 1행 → tb_sku_recipe(sku_id) 조인 → 생산품별
-- tb_prod_stock_txn CONSUME N행(ref_type='SKU_NONSALE', ref_id=log_id) 자동 생성.
-- 레시피 미등록·단위 불일치는 로그만 저장하고 차감은 스킵(소급 차감 없음, 실사가 흡수).
--
-- 정정 = 취소 기록(합산형 불변원장). UPDATE·DELETE 없음. 취소 행(cancel_of=원 log_id) 추가 +
-- 원 CONSUME 행을 부호만 반전한 +CONSUME 역분개(레시피 재계산 없이 원 차감을 그대로 상쇄).
-- 스태프 취소 = 당일(자정 KST 기준) 본인 입력분만, 그 외는 매니저 이상 PC(별도 세션, 예정).
--
-- 집계(개인별 집계 금지 등)·매니저 관리 화면은 별도 세션(예정) 소관 — 본 파일은 스키마만.
--
-- Supabase SQL Editor에서 실행하세요.

begin;

create table tb_sku_nonsale_log (
  log_id       uuid primary key default gen_random_uuid(),
  store_id     uuid not null references tb_store_mst(id) on delete restrict,
  sku_id       uuid not null references tb_sku_mst(id) on delete restrict,
  qty          integer not null,
  reason_code  varchar(20) not null,
  reason_memo  text,
  cancel_of    uuid references tb_sku_nonsale_log(log_id) on delete restrict,
  created_by   uuid not null references staff(id) on delete restrict,
  created_at   timestamptz not null default now(),

  constraint chk_sku_nonsale_qty check (qty > 0),
  constraint chk_sku_nonsale_reason_code check (reason_code in ('MISTAKE', 'CLAIM_REMAKE', 'SERVICE', 'OTHER')),
  constraint chk_sku_nonsale_memo check (
    reason_code <> 'OTHER' or (reason_memo is not null and length(trim(reason_memo)) > 0)
  ),
  constraint uq_sku_nonsale_cancel_of unique (cancel_of)
);

-- 지점·기간별 조회(오늘 내 기록, 사유·기간 집계)에 쓰이는 인덱스
create index idx_sku_nonsale_store_created on tb_sku_nonsale_log(store_id, created_at);
create index idx_sku_nonsale_sku on tb_sku_nonsale_log(sku_id);

comment on table tb_sku_nonsale_log is '판매 외 소진 기록(이벤트 로그). 입력 1건(판매품×개수×사유)=1행. 재고 차감은 tb_prod_stock_txn(ref_type=SKU_NONSALE) 소관';
comment on column tb_sku_nonsale_log.qty is '판매품 개수. 취소 행도 원 기록 개수 그대로(양수)';
comment on column tb_sku_nonsale_log.reason_code is 'MISTAKE 제조실수 / CLAIM_REMAKE 클레임 재제조 / SERVICE 서비스(POS 밖 무료) / OTHER 기타(메모 필수)';
comment on column tb_sku_nonsale_log.cancel_of is '취소 대상 원 기록(log_id). 취소 행만 값 있음. 한 기록은 1회만 취소 가능(UNIQUE)';
comment on column tb_sku_nonsale_log.created_by is '입력자(세션 PIN 직원). 용도=취소 권한 판정·기록 출처 이력만. 개인별 집계·평가 금지';
comment on column tb_sku_nonsale_log.created_at is '기록시각. 당일 취소 판정(자정 기준, Asia/Seoul)·기간 집계 기준';

commit;
