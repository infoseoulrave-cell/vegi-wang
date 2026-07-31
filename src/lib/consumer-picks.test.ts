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
    unitVerified: true,
    sourceMarket: "garak",
    baselineMethod: "kamis_dpr7",
    priceStatus: "live",
    auctionPerKg: 1000,
    auctionPrevPerKg: 1000,
    auctionBaselinePerKg: 1000,
    retailPerKg: 2000,
    history: [
      { date: "2026-07-01", price: 1200 },
      { date: "2026-07-10", price: 1100 },
      { date: "2026-07-20", price: 1000 },
      { date: "2026-07-28", price: 900 },
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
        auctionPerKg: 600,
        retailPerKg: 900,
        history: [
          { date: "2026-07-01", price: 1200 },
          { date: "2026-07-15", price: 1100 },
          { date: "2026-07-28", price: 1000 },
        ],
      }),
      item({
        id: "radish",
        name: "무",
        auctionPerKg: 650,
        retailPerKg: 950,
        history: [
          { date: "2026-07-01", price: 1150 },
          { date: "2026-07-15", price: 1080 },
          { date: "2026-07-28", price: 980 },
        ],
      }),
      item({
        id: "onion",
        name: "양파",
        auctionPerKg: 700,
        retailPerKg: 1000,
        history: [
          { date: "2026-07-01", price: 1100 },
          { date: "2026-07-15", price: 1050 },
          { date: "2026-07-28", price: 950 },
        ],
      }),
      item({
        id: "apple",
        name: "사과",
        category: "과일",
        auctionPerKg: 1000,
        retailPerKg: 4500,
        history: [
          { date: "2026-07-01", price: 900 },
          { date: "2026-07-15", price: 1000 },
          { date: "2026-07-28", price: 1100 },
        ],
      }),
      item({
        id: "banana",
        name: "바나나",
        category: "과일",
        auctionPerKg: 1000,
        retailPerKg: 4000,
        history: [
          { date: "2026-07-01", price: 850 },
          { date: "2026-07-15", price: 950 },
          { date: "2026-07-28", price: 1200 },
        ],
      }),
      item({
        id: "mackerel",
        name: "고등어",
        category: "수산",
        auctionPerKg: 1000,
        retailPerKg: 3800,
        history: [
          { date: "2026-07-01", price: 800 },
          { date: "2026-07-15", price: 1000 },
          { date: "2026-07-28", price: 1300 },
        ],
      }),
      // 가공품 — 추천 후보에서 제외되어야 함
      item({
        id: "chili-powder",
        name: "고춧가루",
        auctionPerKg: 500,
        retailPerKg: 800,
        history: [
          { date: "2026-07-01", price: 1200 },
          { date: "2026-07-28", price: 900 },
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
      auctionPerKg: 600,
      retailPerKg: 800,
      history: [
        { date: "2026-07-01", price: 1200 },
        { date: "2026-07-28", price: 1000 },
      ],
    });
    const expensive = item({
      id: "apple",
      name: "사과",
      category: "과일",
      auctionPerKg: 1500,
      retailPerKg: 4000,
      history: [
        { date: "2026-07-01", price: 800 },
        { date: "2026-07-28", price: 1000 },
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
      auctionPerKg: 1000,
      retailPerKg: 5000,
      history: [
        { date: "2026-07-01", price: 1000 },
        { date: "2026-07-15", price: 1000 },
        { date: "2026-07-28", price: 1000 },
      ],
    });
    const fair = item({
      id: "cucumber",
      name: "오이",
      auctionPerKg: 700,
      retailPerKg: 1100,
      history: [
        { date: "2026-07-01", price: 1200 },
        { date: "2026-07-15", price: 1100 },
        { date: "2026-07-28", price: 1000 },
      ],
    });
    const mid = item({
      id: "tomato",
      name: "토마토",
      auctionPerKg: 900,
      retailPerKg: 1400,
      history: [
        { date: "2026-07-01", price: 1000 },
        { date: "2026-07-15", price: 1000 },
        { date: "2026-07-28", price: 950 },
      ],
    });
    const processed = item({
      id: "sea-salt",
      name: "천일염",
      category: "수산",
      auctionPerKg: 500,
      retailPerKg: 900,
      history: [
        { date: "2026-07-01", price: 1200 },
        { date: "2026-07-28", price: 900 },
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
      auctionPerKg: 1000,
      retailPerKg: 2500,
    });
    const r = totalBasketSaving([a], { cabbage: 2 });
    expect(r.count).toBe(2);
    expect(r.saving).toBe((a.savingPerUnit ?? 0) * 2);
  });
});
