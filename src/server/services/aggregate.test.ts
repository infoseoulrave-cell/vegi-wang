import { describe, expect, it } from "vitest";
import { buildNaturalKey, type RawAuctionRecord } from "@/server/domain/models";
import {
  aggregateRawToDaily,
  computeBaselines,
  MIN_BASELINE_SAMPLE_DAYS,
} from "./aggregate";

describe("buildNaturalKey", () => {
  it("같은 입력이면 같은 키 (멱등 upsert)", () => {
    const a = buildNaturalKey({
      marketCode: "110001",
      corpCode: "11000101",
      itemName: "배추",
      unit: "10kg",
      grade: "상",
      saleDate: "2026-07-27",
      seq: 1,
      price: 9800,
    });
    const b = buildNaturalKey({
      marketCode: "110001",
      corpCode: "11000101",
      itemName: "배추",
      unit: "10kg",
      grade: "상",
      saleDate: "2026-07-27",
      seq: 1,
      price: 9800,
    });
    expect(a).toBe(b);
  });
});

function raw(
  key: string,
  unit: string | null,
  price: number,
  pricePerKg: number | null,
  unitKg: number | null,
  qty: number | null = null,
): RawAuctionRecord {
  return {
    naturalKey: key,
    saleDate: "2026-07-27",
    marketCode: "110001",
    corpCode: key,
    corpName: null,
    itemName: "배추",
    itemVariety: null,
    unit,
    grade: "상",
    origin: "강원",
    qty,
    price,
    unitKg,
    pricePerKg,
    source: "garak",
  };
}

describe("aggregateRawToDaily", () => {
  it("원/kg 축으로 평균낸다 — 상자 크기가 달라도 정합하다", () => {
    // 10kg 9,000원(900원/kg)과 20kg 22,000원(1,100원/kg)
    // 원문 price를 평균내면 15,500이라는 무의미한 값이 나온다.
    const daily = aggregateRawToDaily(
      [
        raw("a", "10kg", 9000, 900, 10, 10),
        raw("b", "20kg", 22000, 1100, 20, 20),
      ],
      new Map([["배추", "cabbage"]]),
    );
    expect(daily).toHaveLength(1);
    expect(daily[0].avgPricePerKg).toBe(1000);
    expect(daily[0].minPricePerKg).toBe(900);
    expect(daily[0].maxPricePerKg).toBe(1100);
    expect(daily[0].volume).toBe(30);
    expect(daily[0].tradeCount).toBe(2);
    expect(daily[0].itemId).toBe("cabbage");
    expect(daily[0].priceStatus).toBe("live");
  });

  it("중량 환산이 불가능한 행은 집계에서 제외한다 (추정하지 않는다)", () => {
    const daily = aggregateRawToDaily(
      [
        raw("a", "10kg", 9000, 900, 10),
        raw("b", "1속", 12000, null, null), // 환산 불가
      ],
      new Map([["배추", "cabbage"]]),
    );
    expect(daily).toHaveLength(1);
    expect(daily[0].avgPricePerKg).toBe(900);
    expect(daily[0].tradeCount).toBe(1);
  });

  it("환산 가능한 행이 하나도 없으면 빈 결과", () => {
    const daily = aggregateRawToDaily(
      [raw("a", "1속", 12000, null, null)],
      new Map(),
    );
    expect(daily).toEqual([]);
  });
});

function daily(saleDate: string, avgPricePerKg: number) {
  return {
    saleDate,
    marketCode: "110001",
    itemId: "cabbage",
    itemName: "배추",
    avgPricePerKg,
    minPricePerKg: avgPricePerKg,
    maxPricePerKg: avgPricePerKg,
    unitKg: 10,
    volume: null,
    tradeCount: 1,
    unit: "10kg",
    grade: null,
    origin: null,
    source: "garak",
    priceStatus: "live" as const,
    asOfDate: null,
  };
}

describe("computeBaselines", () => {
  it(`표본이 ${MIN_BASELINE_SAMPLE_DAYS}일 미만이면 null — 이동평균인 척하지 않는다`, () => {
    const b = computeBaselines({
      itemId: "cabbage",
      marketCode: "110001",
      asOfDate: "2026-07-27",
      windowDays: 30,
      dailyRows: [daily("2026-07-25", 9000), daily("2026-07-27", 11000)],
    });
    expect(b).toBeNull();
  });

  it("표본이 충분하면 원/kg 이동평균과 근거를 남긴다", () => {
    const rows = Array.from({ length: MIN_BASELINE_SAMPLE_DAYS }, (_, i) =>
      daily(`2026-07-${String(i + 10).padStart(2, "0")}`, i < 7 ? 900 : 1100),
    );
    const b = computeBaselines({
      itemId: "cabbage",
      marketCode: "110001",
      asOfDate: "2026-07-27",
      windowDays: 30,
      dailyRows: rows,
    });
    expect(b?.sampleDays).toBe(MIN_BASELINE_SAMPLE_DAYS);
    expect(b?.avgPricePerKg).toBe(1000);
    expect(b?.method).toBe("moving_avg_30");
  });

  it("창 밖의 날짜는 표본에서 제외한다", () => {
    const rows = [
      ...Array.from({ length: MIN_BASELINE_SAMPLE_DAYS }, (_, i) =>
        daily(`2026-07-${String(i + 10).padStart(2, "0")}`, 1000),
      ),
      daily("2026-01-01", 50000), // 한참 이전
    ];
    const b = computeBaselines({
      itemId: "cabbage",
      marketCode: "110001",
      asOfDate: "2026-07-27",
      windowDays: 30,
      dailyRows: rows,
    });
    expect(b?.sampleDays).toBe(MIN_BASELINE_SAMPLE_DAYS);
    expect(b?.avgPricePerKg).toBe(1000);
  });
});
