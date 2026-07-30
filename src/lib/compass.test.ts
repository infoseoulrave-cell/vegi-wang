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
    auctionPrice: 9000,
    auctionPrevPrice: 11200,
    auctionBaseline: 12600,
    retailPricePerKg: 2500,
    history: [
      { date: "2026-06-29", price: 14000, label: "1개월전" },
      { date: "2026-07-15", price: 12000, label: "2주전" },
      { date: "2026-07-22", price: 11000, label: "1주전" },
      { date: "2026-07-28", price: 10000, label: "1일전" },
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

  it("소비자 단위 환산을 유지한다", () => {
    const s = withSignal(cabbage);
    expect(s.consumerAuctionPrice).toBe(2250);
    expect(s.consumerRetailPrice).toBe(6250);
    expect(s.savingPerUnit).toBe(4000);
  });
});
