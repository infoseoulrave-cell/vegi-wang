import { describe, expect, it } from "vitest";
import { addDaysISO } from "@/server/domain/date";
import { withSignal } from "./compass";
import {
  buildTodayPickGroups,
  buildSavingsBasket,
  buyScore,
  savingsBasketScore,
  totalBasketSaving,
  watchScore,
} from "./consumer-picks";
import { isProcessedSourceName } from "./catalog-focus";
import type { PriceItem, PricePoint } from "./types";

const AS_OF = "2026-08-02";

function denseHistory(
  endDate: string,
  days: number,
  high: number,
  low: number,
): PricePoint[] {
  return Array.from({ length: days }, (_, i) => {
    const t = days <= 1 ? 0 : i / (days - 1);
    return {
      date: addDaysISO(endDate, -(days - 1 - i)),
      price: Math.round(high + (low - high) * t),
    };
  });
}

function item(
  partial: Partial<PriceItem> & Pick<PriceItem, "id" | "name">,
  histHigh = 1200,
  histLow = 900,
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
      ...denseHistory(AS_OF, 12, histHigh, histLow),
      { date: AS_OF, price: histLow, label: "오늘" },
    ],
    ...partial,
  });
}

describe("buildTodayPickGroups", () => {
  it("일상 생식품만으로 추천 3·관망 3을 고른다", () => {
    const items = [
      item(
        {
          id: "cabbage",
          name: "배추",
          auctionPerKg: 600,
          retailPerKg: 900,
        },
        1200,
        600,
      ),
      item(
        {
          id: "radish",
          name: "무",
          auctionPerKg: 650,
          retailPerKg: 950,
        },
        1150,
        650,
      ),
      item(
        {
          id: "onion",
          name: "양파",
          auctionPerKg: 700,
          retailPerKg: 1000,
        },
        1100,
        700,
      ),
      item(
        {
          id: "apple",
          name: "사과",
          category: "과일",
          auctionPerKg: 1400,
          retailPerKg: 4500,
        },
        900,
        1400,
      ),
      item(
        {
          id: "banana",
          name: "바나나",
          category: "과일",
          auctionPerKg: 1300,
          retailPerKg: 4000,
        },
        850,
        1300,
      ),
      item(
        {
          id: "mackerel",
          name: "고등어",
          category: "수산",
          auctionPerKg: 1350,
          retailPerKg: 3800,
        },
        800,
        1350,
      ),
      // 가공품 — 추천 후보에서 제외되어야 함
      item(
        {
          id: "chili-powder",
          name: "고춧가루",
          auctionPerKg: 500,
          retailPerKg: 800,
        },
        1200,
        500,
      ),
    ];

    const { buys, watches } = buildTodayPickGroups(items, 3);
    expect(buys).toHaveLength(3);
    expect(watches).toHaveLength(3);
    const allIds = [...buys, ...watches].map((p) => p.item.id);
    expect(allIds).not.toContain("chili-powder");
    expect(new Set(allIds).size).toBe(6);
  });

  it("판정 게이트 미통과 품목은 목록에서 제외한다", () => {
    const judged = item(
      { id: "cabbage", name: "배추", auctionPerKg: 600, retailPerKg: 900 },
      1200,
      600,
    );
    const thin = item({
      id: "radish",
      name: "무",
      auctionPerKg: 650,
      retailPerKg: 950,
      history: [
        { date: "2026-07-28", price: 1000 },
        { date: AS_OF, price: 650, label: "오늘" },
      ],
    });
    expect(judged.trendBasis).toBe("series");
    expect(thin.trendBasis).toBe("none");
    const { buys, watches } = buildTodayPickGroups([judged, thin], 3);
    const ids = [...buys, ...watches].map((p) => p.item.id);
    expect(ids).toContain("cabbage");
    expect(ids).not.toContain("radish");
  });

  it("buyScore가 낮을수록 추천 우선", () => {
    const cheap = item(
      {
        id: "cabbage",
        name: "배추",
        auctionPerKg: 600,
        retailPerKg: 800,
      },
      1200,
      600,
    );
    const expensive = item(
      {
        id: "apple",
        name: "사과",
        category: "과일",
        auctionPerKg: 1500,
        retailPerKg: 4000,
      },
      800,
      1500,
    );
    expect(cheap.trendBasis).toBe("series");
    expect(expensive.trendBasis).toBe("series");
    expect(buyScore(cheap)).toBeLessThan(buyScore(expensive));
    expect(watchScore(expensive)).toBeGreaterThan(watchScore(cheap));
  });
});

describe("buildSavingsBasket", () => {
  it("일상 품목만·거품 제외·절약률 우선", () => {
    const bubble = item(
      {
        id: "grape",
        name: "포도",
        category: "과일",
        auctionPerKg: 1000,
        retailPerKg: 5000,
      },
      1000,
      1000,
    );
    const fair = item(
      {
        id: "cucumber",
        name: "오이",
        auctionPerKg: 700,
        retailPerKg: 1100,
      },
      1200,
      700,
    );
    const mid = item(
      {
        id: "tomato",
        name: "토마토",
        auctionPerKg: 900,
        retailPerKg: 1400,
      },
      1000,
      900,
    );
    const processed = item(
      {
        id: "sea-salt",
        name: "천일염",
        category: "수산",
        auctionPerKg: 500,
        retailPerKg: 900,
      },
      1200,
      500,
    );

    // 가공식품은 카탈로그에서 이미 빠졌고, 방어선은 원천 품목명 기준으로 남는다
    expect(isProcessedSourceName("천일염")).toBe(true);
    expect(isProcessedSourceName("고춧가루")).toBe(true);
    expect(isProcessedSourceName("배추")).toBe(false);
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
