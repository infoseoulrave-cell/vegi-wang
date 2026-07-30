import { describe, expect, it } from "vitest";
import { withSignal } from "./compass";
import {
  buildTodayPickGroups,
  buildSavingsBasket,
  buyScore,
  savingsBasketScore,
  totalBasketSaving,
  watchScore,
} from "./consumer-picks";
import { isProcessedItem } from "./catalog-focus";
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
  it("일상 생식품만으로 추천 3·관망 3을 고른다", () => {
    const items = [
      item({
        id: "cabbage",
        name: "배추",
        auctionPrice: 6000,
        retailPricePerKg: 900,
        history: [
          { date: "2026-07-01", price: 12000 },
          { date: "2026-07-15", price: 11000 },
          { date: "2026-07-28", price: 10000 },
        ],
      }),
      item({
        id: "radish",
        name: "무",
        auctionPrice: 6500,
        retailPricePerKg: 950,
        history: [
          { date: "2026-07-01", price: 11500 },
          { date: "2026-07-15", price: 10800 },
          { date: "2026-07-28", price: 9800 },
        ],
      }),
      item({
        id: "onion",
        name: "양파",
        auctionPrice: 7000,
        retailPricePerKg: 1000,
        history: [
          { date: "2026-07-01", price: 11000 },
          { date: "2026-07-15", price: 10500 },
          { date: "2026-07-28", price: 9500 },
        ],
      }),
      item({
        id: "apple",
        name: "사과",
        category: "과일",
        auctionPrice: 10000,
        retailPricePerKg: 4500,
        history: [
          { date: "2026-07-01", price: 9000 },
          { date: "2026-07-15", price: 10000 },
          { date: "2026-07-28", price: 11000 },
        ],
      }),
      item({
        id: "banana",
        name: "바나나",
        category: "과일",
        auctionPrice: 10000,
        retailPricePerKg: 4000,
        history: [
          { date: "2026-07-01", price: 8500 },
          { date: "2026-07-15", price: 9500 },
          { date: "2026-07-28", price: 12000 },
        ],
      }),
      item({
        id: "mackerel",
        name: "고등어",
        category: "수산",
        auctionPrice: 10000,
        retailPricePerKg: 3800,
        history: [
          { date: "2026-07-01", price: 8000 },
          { date: "2026-07-15", price: 10000 },
          { date: "2026-07-28", price: 13000 },
        ],
      }),
      // 가공품 — 추천 후보에서 제외되어야 함
      item({
        id: "chili-powder",
        name: "고춧가루",
        auctionPrice: 5000,
        retailPricePerKg: 800,
        history: [
          { date: "2026-07-01", price: 12000 },
          { date: "2026-07-28", price: 9000 },
        ],
      }),
    ];

    const { buys, watches } = buildTodayPickGroups(items, 3);
    expect(buys).toHaveLength(3);
    expect(watches).toHaveLength(3);
    const allIds = [...buys, ...watches].map((p) => p.item.id);
    expect(allIds).not.toContain("chili-powder");
    expect(new Set(allIds).size).toBe(6);
  });

  it("buyScore가 낮을수록 추천 우선", () => {
    const cheap = item({
      id: "cabbage",
      name: "배추",
      auctionPrice: 6000,
      retailPricePerKg: 800,
      history: [
        { date: "2026-07-01", price: 12000 },
        { date: "2026-07-28", price: 10000 },
      ],
    });
    const expensive = item({
      id: "apple",
      name: "사과",
      category: "과일",
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

describe("buildSavingsBasket", () => {
  it("일상 품목만·거품 제외·절약률 우선", () => {
    const bubble = item({
      id: "grape",
      name: "포도",
      category: "과일",
      auctionPrice: 10000,
      retailPricePerKg: 5000,
      history: [
        { date: "2026-07-01", price: 10000 },
        { date: "2026-07-15", price: 10000 },
        { date: "2026-07-28", price: 10000 },
      ],
    });
    const fair = item({
      id: "cucumber",
      name: "오이",
      auctionPrice: 7000,
      retailPricePerKg: 1100,
      history: [
        { date: "2026-07-01", price: 12000 },
        { date: "2026-07-15", price: 11000 },
        { date: "2026-07-28", price: 10000 },
      ],
    });
    const mid = item({
      id: "tomato",
      name: "토마토",
      auctionPrice: 9000,
      retailPricePerKg: 1400,
      history: [
        { date: "2026-07-01", price: 10000 },
        { date: "2026-07-15", price: 10000 },
        { date: "2026-07-28", price: 9500 },
      ],
    });
    const processed = item({
      id: "sea-salt",
      name: "천일염",
      category: "수산",
      auctionPrice: 5000,
      retailPricePerKg: 900,
      history: [
        { date: "2026-07-01", price: 12000 },
        { date: "2026-07-28", price: 9000 },
      ],
    });

    expect(isProcessedItem("sea-salt")).toBe(true);
    expect(bubble.retailGap).toBe("bubble");

    const basket = buildSavingsBasket([bubble, fair, mid, processed], 8);
    expect(basket.map((i) => i.id)).not.toContain("grape");
    expect(basket.map((i) => i.id)).not.toContain("sea-salt");
    expect(basket[0]?.id).toBe("cucumber");
    expect(savingsBasketScore(bubble)).toBe(Number.NEGATIVE_INFINITY);
    expect(savingsBasketScore(fair)).toBeGreaterThan(savingsBasketScore(mid));
  });
});

describe("totalBasketSaving", () => {
  it("수량×절약액을 합산한다", () => {
    const a = item({
      id: "cabbage",
      name: "배추",
      auctionPrice: 10000,
      retailPricePerKg: 2500,
    });
    const r = totalBasketSaving([a], { cabbage: 2 });
    expect(r.count).toBe(2);
    expect(r.saving).toBe(a.savingPerUnit * 2);
  });
});
