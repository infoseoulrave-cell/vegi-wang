import { describe, expect, it } from "vitest";
import { addDaysISO } from "@/server/domain/date";
import {
  analyzeTrend,
  canJudgeTiming,
  normalizeSeries,
  percentileRank,
  TIMING_MIN_OBSERVED_DAYS,
  toTrendPosition,
  trendToCompass,
} from "./trend";

function seriesDays(endDate: string, days: number, price = 1000) {
  return Array.from({ length: days }, (_, i) => ({
    date: addDaysISO(endDate, -(days - 1 - i)),
    price: price - i,
  }));
}

describe("canJudgeTiming", () => {
  it("창 밖 데이터만 있으면 실패한다", () => {
    const g = canJudgeTiming(
      [
        { date: "2026-06-01", price: 100 },
        { date: "2026-06-02", price: 110 },
      ],
      "2026-08-02",
    );
    expect(g.ok).toBe(false);
    expect(g.observedDays).toBe(0);
  });

  it("이월된 오늘(excludeDates)은 관측으로 세지 않는다", () => {
    const end = "2026-08-02";
    // 어제까지 9일 + 오늘 점 = 10일 (오늘을 빼면 9일)
    const points = [
      ...seriesDays(addDaysISO(end, -1), 9),
      { date: end, price: 900, label: "오늘" },
    ];
    const without = canJudgeTiming(points, end);
    expect(without.observedDays).toBe(10);
    expect(without.ok).toBe(true);

    const withExclude = canJudgeTiming(points, end, {
      excludeDates: [end],
    });
    expect(withExclude.observedDays).toBe(9);
    expect(withExclude.ok).toBe(false);
  });

  it("경계값 9일 실패 / 10일 통과", () => {
    const end = "2026-08-02";
    expect(canJudgeTiming(seriesDays(end, 9), end).ok).toBe(false);
    expect(canJudgeTiming(seriesDays(end, TIMING_MIN_OBSERVED_DAYS), end).ok).toBe(
      true,
    );
  });

  it("같은 날 중복은 하루로 접는다", () => {
    const end = "2026-08-02";
    const base = seriesDays(end, 10);
    const dup = [...base, { date: end, price: 1 }, { date: end, price: 2 }];
    expect(canJudgeTiming(dup, end).observedDays).toBe(10);
  });
});

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
