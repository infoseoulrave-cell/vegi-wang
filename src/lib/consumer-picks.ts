import type { PriceItemWithSignal } from "./types";

export type PickKind = "buy" | "wait" | "bubble";

export interface TodayPick {
  kind: PickKind;
  title: string;
  subtitle: string;
  item: PriceItemWithSignal;
}

/**
 * 홈용 "오늘 장보기 추천 3"
 * - buy: 최근 저가권 (분위 낮은 순)
 * - wait: 최근 고가권 (분위 높은 순)
 * - bubble: 유통 거품 큰 순 (저가권 우선 tie-break)
 */
export function buildTodayPicks(items: PriceItemWithSignal[]): TodayPick[] {
  if (!items.length) return [];

  const byLow = [...items].sort(
    (a, b) => a.trendPercentile - b.trendPercentile,
  );
  const byHigh = [...items].sort(
    (a, b) => b.trendPercentile - a.trendPercentile,
  );
  const byBubble = [...items].sort((a, b) => {
    if (b.retailMultiple !== a.retailMultiple) {
      return b.retailMultiple - a.retailMultiple;
    }
    return a.trendPercentile - b.trendPercentile;
  });

  const used = new Set<string>();
  const picks: TodayPick[] = [];

  const take = (
    kind: PickKind,
    title: string,
    subtitle: string,
    pool: PriceItemWithSignal[],
    pred?: (i: PriceItemWithSignal) => boolean,
  ) => {
    const hit = pool.find((i) => !used.has(i.id) && (!pred || pred(i)));
    if (!hit) return;
    used.add(hit.id);
    picks.push({ kind, title, subtitle, item: hit });
  };

  take(
    "buy",
    "지금 담기 좋은",
    "최근 동향 기준 저가권",
    byLow,
    (i) => i.trendPosition === "low" || i.trendPercentile <= 40,
  );
  if (!picks.some((p) => p.kind === "buy")) {
    take("buy", "지금 담기 좋은", "오늘 분위가 가장 낮은 품목", byLow);
  }

  take(
    "wait",
    "오늘은 관망",
    "최근 동향 기준 고가권",
    byHigh,
    (i) => i.trendPosition === "high" || i.trendPercentile >= 60,
  );
  if (!picks.some((p) => p.kind === "wait")) {
    take("wait", "오늘은 관망", "오늘 분위가 가장 높은 품목", byHigh);
  }

  take(
    "bubble",
    "소매 거품 주의",
    "소매÷도매 배수가 큼 — 직거래·도매가 유리",
    byBubble,
    (i) => i.retailGap === "bubble" || i.retailMultiple >= 2,
  );
  if (!picks.some((p) => p.kind === "bubble")) {
    take("bubble", "소매 거품 주의", "유통 마진이 큰 편", byBubble);
  }

  return picks;
}

export function totalBasketSaving(
  items: PriceItemWithSignal[],
  qtyById: Record<string, number>,
): { count: number; saving: number; retail: number; wholesale: number } {
  let count = 0;
  let saving = 0;
  let retail = 0;
  let wholesale = 0;
  for (const item of items) {
    const q = Math.max(0, Math.floor(qtyById[item.id] ?? 0));
    if (!q) continue;
    count += q;
    wholesale += item.consumerAuctionPrice * q;
    retail += item.consumerRetailPrice * q;
    saving += item.savingPerUnit * q;
  }
  return { count, saving, retail, wholesale };
}
