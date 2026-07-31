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
