import { describe, expect, it } from "vitest";
import {
  analyzeTrend,
  normalizeSeries,
  percentileRank,
  toTrendPosition,
  trendToCompass,
} from "./trend";

describe("percentileRank / toTrendPosition", () => {
  it("최저가는 낮은 분위, 최고가는 높은 분위", () => {
    const vals = [100, 200, 300, 400, 500];
    expect(percentileRank(vals, 100)).toBeLessThanOrEqual(20);
    expect(percentileRank(vals, 500)).toBeGreaterThanOrEqual(80);
    expect(toTrendPosition(10)).toBe("low");
    expect(toTrendPosition(50)).toBe("mid");
    expect(toTrendPosition(90)).toBe("high");
  });

  it("trendToCompass 매핑", () => {
    expect(trendToCompass("low")).toBe("cheap");
    expect(trendToCompass("mid")).toBe("fair");
    expect(trendToCompass("high")).toBe("expensive");
  });
});

describe("analyzeTrend / normalizeSeries", () => {
  it("현재가가 시리즈 하단이면 low", () => {
    const series = [
      { date: "2026-07-01", price: 12000 },
      { date: "2026-07-08", price: 11000 },
      { date: "2026-07-15", price: 10000 },
      { date: "2026-07-22", price: 9500 },
    ];
    const t = analyzeTrend(series, 9000);
    expect(t.position).toBe("low");
    expect(t.min).toBe(9000);
  });

  it("날짜 중복을 정리한다", () => {
    const s = normalizeSeries([
      { date: "2026-07-02", price: 1 },
      { date: "2026-07-01", price: 2 },
      { date: "2026-07-02", price: 3 },
    ]);
    expect(s.map((p) => p.price)).toEqual([2, 3]);
  });
});
