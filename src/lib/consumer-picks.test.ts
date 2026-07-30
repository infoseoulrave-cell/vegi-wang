import { describe, expect, it } from "vitest";
import { withSignal } from "./compass";
import { buildTodayPicks, totalBasketSaving } from "./consumer-picks";
import type { PriceItem } from "./types";

function item(
  partial: Partial<PriceItem> & Pick<PriceItem, "id" | "name">,
): ReturnType<typeof withSignal> {
  return withSignal({
    category: "채소",
    auctionUnit: "10kg",
    weightKg: 10,
    consumerUnit: "1개",
    kgPerConsumerUnit: 1,
    grade: "상",
    origin: "테스트",
    auctionPrice: 10000,
    auctionPrevPrice: 10000,
    auctionBaseline: 10000,
    retailPricePerKg: 2000,
    history: [
      { date: "2026-07-01", price: 12000 },
      { date: "2026-07-10", price: 11000 },
      { date: "2026-07-20", price: 10000 },
      { date: "2026-07-28", price: 9000 },
    ],
    ...partial,
  });
}

describe("buildTodayPicks", () => {
  it("사기/관망/거품 3장을 서로 다른 품목으로 고른다", () => {
    const items = [
      item({
        id: "a",
        name: "저가",
        auctionPrice: 7000,
        retailPricePerKg: 1200,
        history: [
          { date: "2026-07-01", price: 12000 },
          { date: "2026-07-15", price: 11000 },
          { date: "2026-07-28", price: 10000 },
        ],
      }),
      item({
        id: "b",
        name: "고가",
        auctionPrice: 15000,
        retailPricePerKg: 1800,
        history: [
          { date: "2026-07-01", price: 8000 },
          { date: "2026-07-15", price: 10000 },
          { date: "2026-07-28", price: 12000 },
        ],
      }),
      item({
        id: "c",
        name: "거품",
        auctionPrice: 10000,
        retailPricePerKg: 4000,
        history: [
          { date: "2026-07-01", price: 10000 },
          { date: "2026-07-15", price: 10000 },
          { date: "2026-07-28", price: 10000 },
        ],
      }),
    ];
    const picks = buildTodayPicks(items);
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.item.id)).size).toBe(3);
    expect(picks.map((p) => p.kind).sort()).toEqual(["bubble", "buy", "wait"]);
  });
});

describe("totalBasketSaving", () => {
  it("수량×절약액을 합산한다", () => {
    const a = item({
      id: "a",
      name: "A",
      auctionPrice: 10000,
      retailPricePerKg: 2500,
    });
    const r = totalBasketSaving([a], { a: 2 });
    expect(r.count).toBe(2);
    expect(r.saving).toBe(a.savingPerUnit * 2);
  });
});
