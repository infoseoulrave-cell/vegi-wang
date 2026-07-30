-- 베지왕 소매가 채널 DB — 002
--
-- 배경: 001 스키마는 경락가(도매)만 영속화했다. 소매가(retailPricePerKg)는
-- KAMIS에서 매 요청마다 실시간 조회할 뿐 저장되지 않아, 유통 거품 지표의
-- 한쪽 축에 이력이 없었다.
--
-- 설계 원칙 — 소매가는 채널마다 성격이 다르므로 단일 컬럼으로 합치지 않는다.
--   kamis : 전국 오프라인 소매점 조사 표본. 규격·등급 통제됨.
--   naver : 온라인 산지직송 판매가. 규격 미통제, 택배비 포함여부 혼재.
-- 네이버는 점추정이 신뢰구간을 숨기므로 밴드(p25~p75)+표본수+변동계수를 함께
-- 저장하고, 신뢰등급이 낮은 행은 서빙에서 제외할 수 있게 한다.
--
-- 실측 근거(2026-07, 10개 품목 × 100건): 정제 후 평균 변동계수 0.41,
-- 품목별 0.14(오이)~0.87(배추). 배추처럼 표본이 붕괴하는 품목이 존재한다.

CREATE TABLE IF NOT EXISTS daily_retail_price (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date     DATE NOT NULL,                    -- KST 기준일
  item_id       TEXT REFERENCES items(id),
  item_name     TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('kamis', 'naver')),

  -- 대표값 (원/kg). kamis는 조사가, naver는 표본 중앙값.
  price_per_kg  NUMERIC(14, 2) NOT NULL CHECK (price_per_kg > 0),

  -- 밴드 — naver 전용. kamis는 점추정이라 대표값과 동일하게 채운다.
  p25_per_kg    NUMERIC(14, 2),
  p75_per_kg    NUMERIC(14, 2),

  -- 품질 메타 — naver 전용
  sample_size   INTEGER NOT NULL DEFAULT 0,
  cv            NUMERIC(6, 3),                    -- 변동계수 = 표준편차/평균
  confidence    TEXT NOT NULL DEFAULT 'high'
                  CHECK (confidence IN ('high', 'medium', 'low')),

  payload       JSONB,                            -- 원천 응답 일부 보존
  collected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (sale_date, item_name, source)
);

CREATE INDEX IF NOT EXISTS daily_retail_price_lookup_idx
  ON daily_retail_price (item_name, sale_date DESC);

CREATE INDEX IF NOT EXISTS daily_retail_price_date_idx
  ON daily_retail_price (sale_date DESC);

-- 신뢰 가능한 행만 보는 뷰 — 서빙 기본 경로
CREATE OR REPLACE VIEW daily_retail_price_trusted AS
SELECT *
FROM daily_retail_price
WHERE confidence IN ('high', 'medium');

-- ---------------------------------------------------------------------------
-- 수집 로그에 소매 채널 추가
-- 001의 ingest_runs.source는 CHECK 제약이 없으므로 스키마 변경 불필요.
-- 'naver_retail' / 'kamis_retail' 값을 그대로 사용한다.
-- ---------------------------------------------------------------------------
