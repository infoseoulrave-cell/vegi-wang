import { describe, expect, it } from "vitest";
import { addDaysISO, isValidDateISO, yesterdayKST } from "@/server/domain/date";
import { buildNaturalKey } from "@/server/domain/models";
import {
  aggregateRawToDaily,
  computeBaselines,
} from "@/server/services/aggregate";
import type { RawAuctionRecord } from "@/server/domain/models";

describe("date utils", () => {
  it("addDaysISO / yesterdayKST are stable around midnight", () => {
    expect(addDaysISO("2026-07-27", -1)).toBe("2026-07-26");
    expect(yesterdayKST("2026-07-27")).toBe("2026-07-26");
    expect(isValidDateISO("2026-07-27")).toBe(true);
    expect(isValidDateISO("2026-13-01")).toBe(false);
    expect(isValidDateISO("26-07-27")).toBe(false);
  });
});

describe("natural key", () => {
  it("is deterministic for upsert idempotency", () => {
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

describe("aggregateRawToDaily", () => {
  const rows: RawAuctionRecord[] = [
    {
      naturalKey: "a",
      saleDate: "2026-07-27",
      marketCode: "110001",
      corpCode: "1",
      corpName: null,
      itemName: "배추",
      itemVariety: null,
      unit: "10kg",
      grade: "상",
      origin: "강원",
      qty: 10,
      price: 9000,
      source: "garak",
    },
    {
      naturalKey: "b",
      saleDate: "2026-07-27",
      marketCode: "110001",
      corpCode: "2",
      corpName: null,
      itemName: "배추",
      itemVariety: null,
      unit: "10kg",
      grade: "상",
      origin: "강원",
      qty: 20,
      price: 11000,
      source: "garak",
    },
  ];

  it("averages prices and sums volume", () => {
    const daily = aggregateRawToDaily(rows, new Map([["배추", "cabbage"]]));
    expect(daily).toHaveLength(1);
    expect(daily[0].avgPrice).toBe(10000);
    expect(daily[0].minPrice).toBe(9000);
    expect(daily[0].maxPrice).toBe(11000);
    expect(daily[0].volume).toBe(30);
    expect(daily[0].tradeCount).toBe(2);
    expect(daily[0].itemId).toBe("cabbage");
  });
});

describe("computeBaselines", () => {
  it("averages window and counts sample days", () => {
    const b = computeBaselines({
      itemId: "cabbage",
      marketCode: "110001",
      asOfDate: "2026-07-27",
      windowDays: 3,
      dailyRows: [
        {
          saleDate: "2026-07-25",
          marketCode: "110001",
          itemId: "cabbage",
          itemName: "배추",
          avgPrice: 9000,
          minPrice: 9000,
          maxPrice: 9000,
          volume: null,
          tradeCount: 1,
          unit: null,
          grade: null,
          origin: null,
          source: "garak",
        },
        {
          saleDate: "2026-07-27",
          marketCode: "110001",
          itemId: "cabbage",
          itemName: "배추",
          avgPrice: 11000,
          minPrice: 11000,
          maxPrice: 11000,
          volume: null,
          tradeCount: 1,
          unit: null,
          grade: null,
          origin: null,
          source: "garak",
        },
      ],
    });
    expect(b?.avgPrice).toBe(10000);
    expect(b?.sampleDays).toBe(2);
  });
});
