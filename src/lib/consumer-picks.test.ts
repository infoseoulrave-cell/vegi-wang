import { describe, expect, it } from "vitest";
import { withSignal } from "./compass";
import {
  buildTodayPickGroups,
  buyScore,
  totalBasketSaving,
  watchScore,
} from "./consumer-picks";
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

describe("buildTodayPickGroups", () => {
  it("추천 3과 관망 3을 서로 다른 품목으로 고른다", () => {
    const items = [
      item({
        id: "low1",
        name: "저가1",
        auctionPrice: 6000,
        retailPricePerKg: 900,
        history: [
          { date: "2026-07-01", price: 12000 },
          { date: "2026-07-15", price: 11000 },
          { date: "2026-07-28", price: 10000 },
        ],
      }),
      item({
        id: "low2",
        name: "저가2",
        auctionPrice: 6500,
        retailPricePerKg: 950,
        history: [
          { date: "2026-07-01", price: 11500 },
          { date: "2026-07-15", price: 10800 },
          { date: "2026-07-28", price: 9800 },
        ],
      }),
      item({
        id: "low3",
        name: "저가3",
        auctionPrice: 7000,
        retailPricePerKg: 1000,
        history: [
          { date: "2026-07-01", price: 11000 },
          { date: "2026-07-15", price: 10500 },
          { date: "2026-07-28", price: 9500 },
        ],
      }),
      item({
        id: "bubble1",
        name: "거품1",
        auctionPrice: 10000,
        retailPricePerKg: 4500,
        history: [
          { date: "2026-07-01", price: 9000 },
          { date: "2026-07-15", price: 10000 },
          { date: "2026-07-28", price: 11000 },
        ],
      }),
      item({
        id: "bubble2",
        name: "거품2",
        auctionPrice: 10000,
        retailPricePerKg: 4000,
        history: [
          { date: "2026-07-01", price: 8500 },
          { date: "2026-07-15", price: 9500 },
          { date: "2026-07-28", price: 12000 },
        ],
      }),
      item({
        id: "bubble3",
        name: "거품3",
        auctionPrice: 10000,
        retailPricePerKg: 3800,
        history: [
          { date: "2026-07-01", price: 8000 },
          { date: "2026-07-15", price: 10000 },
          { date: "2026-07-28", price: 13000 },
        ],
      }),
    ];

    const { buys, watches } = buildTodayPickGroups(items, 3);
    expect(buys).toHaveLength(3);
    expect(watches).toHaveLength(3);
    const buyIds = buys.map((p) => p.item.id);
    const watchIds = watches.map((p) => p.item.id);
    expect(new Set([...buyIds, ...watchIds]).size).toBe(6);
    expect(buys.every((p) => p.kind === "buy")).toBe(true);
    expect(watches.every((p) => p.kind === "watch")).toBe(true);
    // 추천은 저가 쪽, 관망은 거품 쪽
    expect(buyIds.every((id) => id.startsWith("low"))).toBe(true);
    expect(watchIds.every((id) => id.startsWith("bubble"))).toBe(true);
  });

  it("buyScore가 낮을수록 추천 우선", () => {
    const cheap = item({
      id: "c",
      name: "c",
      auctionPrice: 6000,
      retailPricePerKg: 800,
      history: [
        { date: "2026-07-01", price: 12000 },
        { date: "2026-07-28", price: 10000 },
      ],
    });
    const expensive = item({
      id: "e",
      name: "e",
      auctionPrice: 15000,
      retailPricePerKg: 4000,
      history: [
        { date: "2026-07-01", price: 8000 },
        { date: "2026-07-28", price: 10000 },
      ],
    });
    expect(buyScore(cheap)).toBeLessThan(buyScore(expensive));
    expect(watchScore(expensive)).toBeGreaterThan(watchScore(cheap));
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
