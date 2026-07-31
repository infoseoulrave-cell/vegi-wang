-- 베지왕 수산 위판장 원천 추가 — 004
--
-- 배경: 가락은 청과 6개 법인만 조회하므로 수산 경락가 원천이 아예 없었고,
--   그 자리를 하드코딩 더미가 메우고 있었다(조기 66,667원/kg 등).
--   해양수산부 '위판장별 위탁판매 현황'(공공데이터포털 15056856)을 붙인다.
--
-- 축: csmtAmount(위판금액) ÷ csmtWt(위판중량) = 원/kg.
--   단위 문자열을 파싱하지 않는 자기완결적 환산이라 가락 UUN보다 안전하다.
--   원문 단가(csmtUntpc)는 상자/마리 기준이 섞여 있어 price 컬럼에만 보존하고
--   집계에는 쓰지 않는다.

-- ---------------------------------------------------------------------------
-- 원천 소스에 위판장 추가
-- 001의 CHECK는 ('at','garak','manual')만 허용한다.
-- ---------------------------------------------------------------------------
ALTER TABLE raw_auction DROP CONSTRAINT IF EXISTS raw_auction_source_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raw_auction_source_chk'
  ) THEN
    ALTER TABLE raw_auction
      ADD CONSTRAINT raw_auction_source_chk
      CHECK (source IN ('at', 'garak', 'fish_market', 'manual'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 위판장 마스터
--
-- 표준 도매시장코드 체계(가락=110001)에 속하지 않는 별도 원천이므로
-- 900001을 부여한다. 개별 위판장명은 raw_auction.corp_name에 남긴다.
-- ---------------------------------------------------------------------------
INSERT INTO markets (code, name, region)
VALUES ('900001', '전국 수협 위판장', '전국')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 품목이 어느 시장에서 오는지 명시
--
-- 청과는 가락, 수산은 위판장으로 원천이 다르고 유통 단계도 다르다.
-- 한 화면에 섞이므로 품목마다 출처를 들고 다녀야 한다.
-- ---------------------------------------------------------------------------
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS source_market TEXT NOT NULL DEFAULT 'garak';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_source_market_chk'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_source_market_chk
      CHECK (source_market IN ('garak', 'fish_market'));
  END IF;
END $$;

UPDATE items SET source_market = 'fish_market'
WHERE category = '수산' AND source_market <> 'fish_market';

CREATE INDEX IF NOT EXISTS items_source_market_idx ON items (source_market);
