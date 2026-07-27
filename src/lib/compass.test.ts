import { describe, expect, it } from "vitest";
import { toCompass, toRetailGap, withSignal } from "./compass";
import type { PriceItem } from "./types";

describe("toCompass (살 타이밍)", () => {
  it("평년比 -10% 이하면 cheap, +10% 이상이면 expensive", () => {
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

describe("withSignal (경락가 + 소매가 결합)", () => {
  const cabbage: PriceItem = {
    id: "cabbage",
    name: "배추",
    category: "채소",
    auctionUnit: "10kg 그물망",
    weightKg: 10,
    grade: "상",
    origin: "강원 평창",
    auctionPrice: 9800,
    auctionPrevPrice: 11200,
    auctionBaseline: 12600,
    retailPricePerKg: 2500,
  };

  it("경락가를 원/kg로 환산하고 두 지표·절약액·추천을 계산한다", () => {
    const s = withSignal(cabbage);
    expect(s.auctionPerKg).toBe(980); // 9800 / 10
    expect(s.deviationRate).toBe(-22.2); // 평년比
    expect(s.compass).toBe("cheap");
    expect(s.retailMultiple).toBe(2.55); // 2500 / 980
    expect(s.retailGap).toBe("bubble");
    expect(s.savingPerKg).toBe(1520); // 2500 - 980
    expect(s.recommendation).toContain("도매시장·산지직송");
  });
});
