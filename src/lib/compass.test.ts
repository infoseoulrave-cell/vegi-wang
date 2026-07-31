import { describe, expect, it } from "vitest";
import { toCompass, toRetailGap, withSignal } from "./compass";
import type { PriceItem } from "./types";

describe("toCompass (편차 폴백)", () => {
  it("평균比 -10% 이하면 cheap, +10% 이상이면 expensive", () => {
    expect(toCompass(-22.2)).toBe("cheap");
    expect(toCompass(0)).toBe("fair");
    expect(toCompass(27.3)).toBe("expensive");
  });
});

describe("toRetailGap (유통 거품)", () => {
  it("배수 1.8 미만 합리적 / 2.5 이상 거품", () => {
    expect(toRetailGap(1.39)).toBe("reasonable");
    expect(toRetailGap(2.1)).toBe("normal");
    expect(toRetailGap(2.55)).toBe("bubble");
  });
});

describe("withSignal (최근 동향 포지션)", () => {
  // 모든 가격은 원/kg 축이다.
  const cabbage: PriceItem = {
    id: "cabbage",
    name: "배추",
    category: "채소",
    auctionUnit: "10kg 그물망",
    weightKg: 10,
    consumerUnit: "1포기",
    kgPerConsumerUnit: 2.5,
    grade: "상",
    origin: "강원 평창",
    unitVerified: true,
    sourceMarket: "garak",
    auctionPerKg: 900,
    auctionPrevPerKg: 1120,
    auctionBaselinePerKg: 1260,
    baselineMethod: "kamis_dpr7",
    retailPerKg: 2500,
    priceStatus: "live",
    history: [
      { date: "2026-06-29", price: 1400, label: "1개월전" },
      { date: "2026-07-15", price: 1200, label: "2주전" },
      { date: "2026-07-22", price: 1100, label: "1주전" },
      { date: "2026-07-28", price: 1000, label: "1일전" },
    ],
  };

  it("시리즈 분위 기반으로 저가권·그래프·추천을 만든다", () => {
    const s = withSignal(cabbage);
    expect(s.auctionPerKg).toBe(900);
    expect(s.trendPosition).toBe("low");
    expect(s.compass).toBe("cheap");
    expect(s.chartSeries.length).toBeGreaterThanOrEqual(4);
    expect(s.retailMultiple).toBe(2.78);
    expect(s.recommendation).toContain("저가권");
  });

  /**
   * 이중 나눗셈 회귀 방지.
   * withSignal은 원/kg를 입력으로 받아 **곱하기만** 해야 한다.
   * 예전에는 auctionPrice/weightKg를 수행해 무 36원/kg 같은 값을 만들었다.
   */
  it("입력 원/kg를 나누지 않고 상자가·소비자단위가를 곱해서 파생한다", () => {
    const s = withSignal(cabbage);
    expect(s.auctionPerKg).toBe(900); // 입력 그대로
    expect(s.auctionUnitPrice).toBe(9000); // 900 × 10kg
    expect(s.consumerAuctionPrice).toBe(2250); // 900 × 2.5kg
    expect(s.consumerRetailPrice).toBe(6250); // 2500 × 2.5kg
    expect(s.savingPerUnit).toBe(4000);
  });

  it("소매가가 없으면 거품 지표를 만들어내지 않는다", () => {
    const s = withSignal({ ...cabbage, retailPerKg: undefined });
    expect(s.retailMultiple).toBeUndefined();
    expect(s.retailGap).toBeUndefined();
    expect(s.savingPerKg).toBeUndefined();
    expect(s.consumerRetailPrice).toBeUndefined();
    expect(s.savingPerUnit).toBeUndefined();
    // 경락가 쪽 지표는 그대로 살아 있다
    expect(s.auctionPerKg).toBe(900);
    expect(s.compass).toBe("cheap");
  });

  /**
   * 원천 혼입 회귀 방지.
   *
   * 예전에는 오늘값(가락)을 KAMIS 시계열의 어제값과 비교해 등락률을 만들었다.
   * 두 원천의 가격대가 달라(배추 실측 1,895 vs 1,128) 시세가 그대로여도
   * +68%가 찍혔다. 프로덕션 시금치 +218%·감귤 +192%가 그 결과다.
   */
  it("같은 원천 전일값이 없으면 등락률을 만들지 않는다", () => {
    const s = withSignal({ ...cabbage, auctionPrevPerKg: undefined });
    expect(s.changeRate).toBeUndefined();
  });

  it("전일값이 있으면 등락률을 낸다", () => {
    const s = withSignal({ ...cabbage, auctionPrevPerKg: 1000 });
    expect(s.changeRate).toBe(-10);
  });

  it("기준선이 없으면 편차율도 만들지 않는다", () => {
    const s = withSignal({
      ...cabbage,
      auctionBaselinePerKg: 0,
      baselineMethod: "none",
      history: [],
    });
    expect(s.deviationRate).toBeUndefined();
    expect(s.trendBasis).toBe("none");
  });

  it("오늘 한 점뿐이면 추세로 치지 않는다", () => {
    const s = withSignal({
      ...cabbage,
      auctionBaselinePerKg: 0,
      baselineMethod: "none",
      history: [{ date: "2026-07-31", price: 900, label: "오늘" }],
    });
    expect(s.trendBasis).toBe("none");
    expect(s.recommendation).toContain("이력이 쌓이면");
  });

  it("시계열이 2점 이상이면 분위 기반 추세를 쓴다", () => {
    const s = withSignal(cabbage);
    expect(s.trendBasis).toBe("series");
    expect(s.trendPosition).toBe("low");
  });

  /**
   * 분위는 시계열과 같은 원천 값으로 재야 한다.
   * 표시 가격(가락)을 KAMIS 분포에 끼워 넣으면 원천 차이만큼 위로 밀려
   * 모든 품목이 '고가권'이 된다.
   */
  it("trendPerKg가 있으면 그 값으로 분위를 잰다", () => {
    const kamisSeries = [
      { date: "2026-07-20", price: 1000, source: "kamis" as const },
      { date: "2026-07-25", price: 1100, source: "kamis" as const },
      { date: "2026-07-31", price: 1050, source: "kamis" as const },
    ];
    // 표시 가격은 가락 1,895 (KAMIS 분포 최상단) — 그대로 재면 항상 고가권
    const naive = withSignal({
      ...cabbage,
      auctionPerKg: 1895,
      auctionBaselinePerKg: 0,
      baselineMethod: "none",
      history: kamisSeries,
    });
    expect(naive.trendPosition).toBe("high");

    // KAMIS 오늘값(1,050)으로 재면 중위권 — 실제 시세 위치
    const correct = withSignal({
      ...cabbage,
      auctionPerKg: 1895,
      trendPerKg: 1050,
      trendSource: "kamis",
      auctionBaselinePerKg: 0,
      baselineMethod: "none",
      history: kamisSeries,
    });
    expect(correct.trendPosition).toBe("mid");
    // 표시 가격은 그대로 가락
    expect(correct.auctionPerKg).toBe(1895);
  });

  it("수산은 거품 판정을 유보하고 배수만 남긴다", () => {
    const fish = withSignal({
      ...cabbage,
      sourceMarket: "fish_market",
      auctionPerKg: 5000,
      retailPerKg: 20000,
    });
    // 배수는 계산한다
    expect(fish.retailMultiple).toBe(4);
    // 산지 위판가라 유통 단계가 달라 청과 임계값으로 판정하지 않는다
    expect(fish.retailGap).toBeUndefined();

    const produce = withSignal({
      ...cabbage,
      auctionPerKg: 5000,
      retailPerKg: 20000,
    });
    expect(produce.retailGap).toBe("bubble");
  });

  it("이월 상태와 기준일을 그대로 전달한다", () => {
    const s = withSignal({
      ...cabbage,
      priceStatus: "carried",
      asOfDate: "2026-07-29",
    });
    expect(s.priceStatus).toBe("carried");
    expect(s.asOfDate).toBe("2026-07-29");
  });
});
