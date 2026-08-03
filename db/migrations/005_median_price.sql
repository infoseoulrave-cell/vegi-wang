-- 대표가를 평균에서 중앙값으로.
--
-- 평균은 포장 단위 구성에 휘둘린다. 2026-08-03 실측, 같은 날 같은 "무":
--   4kg  868행  평균 3,271원/kg
--   8kg  848행  평균 1,879원/kg
--   20kg 398행  평균   439원/kg
-- 7.5배 차이는 시세 변동이 아니다. 단순 평균은 행 하나를 한 표로 세므로
-- 소포장 행이 많은 쪽으로 대표가가 끌려간다(무 평균 2,255 vs 중앙값 1,975).
--
-- avg_price_per_kg를 덮어쓰지 않고 컬럼을 따로 둔다. 평균이라 이름 붙은
-- 자리에 중앙값을 넣으면 나중에 읽는 사람이 반드시 속는다.
ALTER TABLE daily_item_price
  ADD COLUMN IF NOT EXISTS median_price_per_kg NUMERIC(14, 2);

COMMENT ON COLUMN daily_item_price.median_price_per_kg IS
  '대표가(원/kg). 평균은 포장 구성에 휘둘려 대표성이 없다. 서빙은 이 값을 쓴다.';
COMMENT ON COLUMN daily_item_price.avg_price_per_kg IS
  '산술평균(원/kg). 진단·비교용으로 남긴다. 대표가로 쓰지 말 것 — median_price_per_kg를 쓴다.';
