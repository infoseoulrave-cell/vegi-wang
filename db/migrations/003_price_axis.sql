-- 베지왕 가격 축 정규화 — 003
--
-- 배경: 001/002 스키마는 가격 컬럼의 **축**을 명시하지 않았다.
--   raw_auction.price 는 거래단위 가격(10kg 상자가 등),
--   daily_item_price.avg_price 는 그 값들의 단순 평균이었다.
--   가락 응답에는 10kg·20kg 상자가가 섞여 오므로 이 평균은 무의미하고,
--   서빙 단에서 다시 weightKg로 나누면서 이중 나눗셈이 발생했다
--   (프로덕션 실측: 무 36원/kg, 피망 소매/도매 배수 64.6배).
--
-- 설계: 내부 표준축은 원/kg 하나. 나눗셈은 수집 어댑터에서 한 번만 하고,
--   상자가·1개가는 표시 직전에 곱해서 만든다.
--   docs/superpowers/specs/2026-07-31-price-axis-and-baseline-design.md
--
-- 원문 보존 원칙에 따라 기존 거래단위 컬럼은 삭제하지 않는다.
-- 축 규칙이 바뀌어도 raw에서 언제든 재집계할 수 있어야 한다.

-- ---------------------------------------------------------------------------
-- 원천: 파생 원/kg 보존
-- unit_kg 가 NULL 이면 거래단량을 중량으로 환산할 수 없는 행 → 집계 제외 대상
-- ---------------------------------------------------------------------------
ALTER TABLE raw_auction
  ADD COLUMN IF NOT EXISTS unit_kg      NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS price_per_kg NUMERIC(14, 2);

CREATE INDEX IF NOT EXISTS raw_auction_per_kg_idx
  ON raw_auction (item_name, sale_date)
  WHERE price_per_kg IS NOT NULL;

-- 기존 원천 행의 파생 원/kg 백필.
-- 정규식은 선행 0이 없는 '.16kg' 형태를 반드시 포함해야 한다 (아래 주석 참고).
UPDATE raw_auction
SET unit_kg = NULLIF(
      substring(unit FROM '([0-9]*\.?[0-9]+)\s*[kK][gG]'), ''
    )::numeric
WHERE unit_kg IS NULL AND unit IS NOT NULL;

UPDATE raw_auction
SET price_per_kg = ROUND(price / unit_kg, 2)
WHERE price_per_kg IS NULL AND unit_kg IS NOT NULL AND unit_kg > 0;

-- ---------------------------------------------------------------------------
-- 일별 집계: 원/kg 축 + 신선도 상태
-- ---------------------------------------------------------------------------
ALTER TABLE daily_item_price
  ADD COLUMN IF NOT EXISTS avg_price_per_kg NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS min_price_per_kg NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS max_price_per_kg NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS unit_kg          NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS price_status     TEXT NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS as_of_date       DATE,
  ADD COLUMN IF NOT EXISTS quality          TEXT NOT NULL DEFAULT 'ok';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_item_price_status_chk'
  ) THEN
    ALTER TABLE daily_item_price
      ADD CONSTRAINT daily_item_price_status_chk
      CHECK (price_status IN ('live', 'carried', 'missing'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_item_price_quality_chk'
  ) THEN
    ALTER TABLE daily_item_price
      ADD CONSTRAINT daily_item_price_quality_chk
      CHECK (quality IN ('ok', 'rejected'));
  END IF;
END $$;

-- 기존 행이 있다면 거래단위 평균을 unit_kg로 환산해 채운다.
-- ⚠ 정규식 주의: 가락 UUN에는 '.16kg' '.7kg'처럼 선행 0이 없는 값이 온다.
--   '[0-9]+' 로 시작하면 '.16kg'이 16으로 읽혀 100배 오차가 난다.
--   TypeScript parseUnitKg는 [\d.]+ 라 정상이었고 SQL만 틀렸었다.
-- unit_kg를 모르는 행은 NULL로 남겨 서빙에서 제외되게 한다.
UPDATE daily_item_price
SET unit_kg = NULLIF(
      substring(unit FROM '([0-9]*\.?[0-9]+)\s*[kK][gG]'), ''
    )::numeric
WHERE unit_kg IS NULL AND unit IS NOT NULL;

UPDATE daily_item_price
SET avg_price_per_kg = ROUND(avg_price / unit_kg, 2),
    min_price_per_kg = ROUND(min_price / unit_kg, 2),
    max_price_per_kg = ROUND(max_price / unit_kg, 2)
WHERE avg_price_per_kg IS NULL AND unit_kg IS NOT NULL AND unit_kg > 0;

CREATE INDEX IF NOT EXISTS daily_item_price_served_idx
  ON daily_item_price (market_code, sale_date)
  WHERE quality = 'ok' AND avg_price_per_kg IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 기준선: 원/kg + 산출 근거 추적
--
-- method 로 "어떤 근거의 기준선인가"를 항상 설명할 수 있게 한다.
--   kamis_dpr7    : 자체 이력 부족 → KAMIS 평년가 (부트스트랩)
--   moving_avg_30 : 자체 경락가 이력 30일 이동평균
--   seasonal      : 전년 동시기 혼합
-- 표본이 부족한데 이동평균인 척하지 않는 것이 핵심이다.
-- ---------------------------------------------------------------------------
ALTER TABLE item_baseline
  ADD COLUMN IF NOT EXISTS avg_price_per_kg NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'moving_avg_30';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_baseline_method_chk'
  ) THEN
    ALTER TABLE item_baseline
      ADD CONSTRAINT item_baseline_method_chk
      CHECK (method IN ('kamis_dpr7', 'moving_avg_30', 'seasonal', 'none'));
  END IF;
END $$;

-- 기존 기준선의 원/kg 백필 — daily 집계의 unit_kg를 근거로 환산한다.
UPDATE item_baseline b
SET avg_price_per_kg = ROUND(b.avg_price / d.unit_kg, 2)
FROM daily_item_price d
WHERE b.avg_price_per_kg IS NULL
  AND d.item_id = b.item_id AND d.market_code = b.market_code
  AND d.unit_kg IS NOT NULL AND d.unit_kg > 0;

-- 표본이 부족한데 'moving_avg_30'을 자처하던 과거 행 제거.
-- 새 규칙(MIN_BASELINE_SAMPLE_DAYS=14)에서는 애초에 생성되지 않는다.
-- 파생 데이터라 raw_auction에서 언제든 재계산된다.
DELETE FROM item_baseline WHERE sample_days < 14;

-- ---------------------------------------------------------------------------
-- 품목 마스터: 환산표 검증 상태
-- 검증되지 않은 품목은 이력은 쌓되 서빙에서 제외한다.
-- 판정 근거: docs/CATALOG_VERIFICATION.md (scripts/verify-catalog.mjs)
-- ---------------------------------------------------------------------------
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS unit_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unit_source          TEXT,
  ADD COLUMN IF NOT EXISTS verification_note    TEXT,
  ADD COLUMN IF NOT EXISTS plausible_min_per_kg NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS plausible_max_per_kg NUMERIC(14, 2);

-- ---------------------------------------------------------------------------
-- 서빙 기본 경로 — 축이 확정되고 품질 검사를 통과한 행만
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW daily_item_price_served AS
SELECT d.*
FROM daily_item_price d
JOIN items i ON i.id = d.item_id
WHERE d.quality = 'ok'
  AND d.avg_price_per_kg IS NOT NULL
  AND i.unit_verified = TRUE;
