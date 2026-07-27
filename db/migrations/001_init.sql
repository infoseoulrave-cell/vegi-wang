-- 베지왕 아침 경매가 DB — 초기 스키마
-- 대상: Postgres (Neon / Vercel Postgres / Supabase 호환)
-- 타임존 정책: 비즈니스 일자는 KST(YYYY-MM-DD), 타임스탬프는 timestamptz(UTC 저장)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 마스터: 도매시장
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS markets (
  code        TEXT PRIMARY KEY,                 -- 표준 도매시장코드 (가락=110001)
  name        TEXT NOT NULL,
  region      TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 마스터: 품목 (내부 카탈로그 + 표준코드 매핑)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id              TEXT PRIMARY KEY,             -- 내부 slug (cabbage, apple …)
  name            TEXT NOT NULL UNIQUE,         -- 표시명 (배추, 사과(후지))
  category        TEXT NOT NULL CHECK (category IN ('채소', '과일', '수산')),
  auction_unit    TEXT NOT NULL,
  weight_kg       NUMERIC(10, 3) NOT NULL CHECK (weight_kg > 0),
  default_grade   TEXT,
  default_origin  TEXT,
  std_lclsf_cd    TEXT,                         -- 표준 대분류
  std_mclsf_cd    TEXT,                         -- 표준 중분류
  std_sclsf_cd    TEXT,                         -- 표준 소분류
  kamis_item_name TEXT,                         -- KAMIS 매칭용 이름
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_category_idx ON items (category);

-- ---------------------------------------------------------------------------
-- 원천 경락 레코드 (append-only, 멱등 upsert)
-- 자연키: market + corp + item_name + unit + grade + sale_date + seq
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_auction (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  natural_key   TEXT NOT NULL UNIQUE,           -- 멱등 키
  sale_date     DATE NOT NULL,                  -- KST 영업일
  market_code   TEXT NOT NULL REFERENCES markets(code),
  corp_code     TEXT,                           -- 도매법인 코드
  corp_name     TEXT,
  item_name     TEXT NOT NULL,
  item_variety  TEXT,
  unit          TEXT,
  grade         TEXT,
  origin        TEXT,
  qty           NUMERIC(14, 3),
  price         NUMERIC(14, 2) NOT NULL CHECK (price > 0),
  source        TEXT NOT NULL CHECK (source IN ('at', 'garak', 'manual')),
  payload       JSONB,                          -- 원천 행 보존
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS raw_auction_sale_date_idx ON raw_auction (sale_date);
CREATE INDEX IF NOT EXISTS raw_auction_market_item_idx ON raw_auction (market_code, item_name, sale_date);

-- ---------------------------------------------------------------------------
-- 품목×시장×일자 집계 (serving 원천)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_item_price (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date     DATE NOT NULL,
  market_code   TEXT NOT NULL REFERENCES markets(code),
  item_id       TEXT REFERENCES items(id),
  item_name     TEXT NOT NULL,
  avg_price     NUMERIC(14, 2) NOT NULL,
  min_price     NUMERIC(14, 2) NOT NULL,
  max_price     NUMERIC(14, 2) NOT NULL,
  volume        NUMERIC(14, 3),
  trade_count   INTEGER NOT NULL DEFAULT 0,
  unit          TEXT,
  grade         TEXT,
  origin        TEXT,
  source        TEXT NOT NULL,
  aggregated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sale_date, market_code, item_name)
);

CREATE INDEX IF NOT EXISTS daily_item_price_lookup_idx
  ON daily_item_price (market_code, sale_date);

-- ---------------------------------------------------------------------------
-- 품목별 기준가 (최근 N일 평균 — 자체 평년선)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_baseline (
  item_id       TEXT NOT NULL REFERENCES items(id),
  market_code   TEXT NOT NULL REFERENCES markets(code),
  window_days   INTEGER NOT NULL DEFAULT 30,
  as_of_date    DATE NOT NULL,
  avg_price     NUMERIC(14, 2) NOT NULL,
  sample_days   INTEGER NOT NULL DEFAULT 0,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, market_code, window_days, as_of_date)
);

-- ---------------------------------------------------------------------------
-- 소비자 니즈 DB (대기자)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  interest      TEXT NOT NULL DEFAULT '전체',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON waitlist (created_at DESC);

-- ---------------------------------------------------------------------------
-- 수집 잡 실행 로그
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date     DATE NOT NULL,
  market_code   TEXT NOT NULL,
  source        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('running', 'success', 'empty', 'failed')),
  rows_fetched  INTEGER NOT NULL DEFAULT 0,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ingest_runs_sale_date_idx ON ingest_runs (sale_date DESC);

-- ---------------------------------------------------------------------------
-- 시드: 가락시장
-- ---------------------------------------------------------------------------
INSERT INTO markets (code, name, region)
VALUES ('110001', '서울 가락동 농수산물도매시장', '서울')
ON CONFLICT (code) DO NOTHING;
