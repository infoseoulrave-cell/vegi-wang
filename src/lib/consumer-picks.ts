import type { PriceItemWithSignal } from "./types";

export type PickKind = "buy" | "watch";

export interface TodayPick {
  kind: PickKind;
  rank: number;
  title: string;
  subtitle: string;
  item: PriceItemWithSignal;
}

export interface TodayPickGroups {
  buys: TodayPick[];
  watches: TodayPick[];
}

/** 구매 추천 점수 — 낮을수록 담기 좋음 (저가권 + 유통마진 양호) */
export function buyScore(item: PriceItemWithSignal): number {
  const bubblePenalty =
    item.retailGap === "bubble"
      ? 40
      : item.retailGap === "normal"
        ? 12
        : 0;
  const multiplePenalty = Math.max(0, (item.retailMultiple - 1.5) * 10);
  return item.trendPercentile + bubblePenalty + multiplePenalty;
}

/** 관망 점수 — 높을수록 거품·고가 주의 */
export function watchScore(item: PriceItemWithSignal): number {
  const bubbleBoost =
    item.retailGap === "bubble" ? 50 : item.retailGap === "normal" ? 15 : 0;
  const multipleBoost = Math.max(0, (item.retailMultiple - 1.8) * 25);
  return multipleBoost + bubbleBoost + item.trendPercentile * 0.35;
}

function buyTitle(item: PriceItemWithSignal, rank: number): {
  title: string;
  subtitle: string;
} {
  if (item.trendPosition === "low" && item.retailGap !== "bubble") {
    return {
      title: rank === 1 ? "지금 가장 담기 좋은" : "담기 좋은 타이밍",
      subtitle: "최근 저가권 · 유통마진도 양호",
    };
  }
  if (item.trendPosition === "low") {
    return {
      title: "저가권 진입",
      subtitle: "최근 동향 대비 낮은 가격대",
    };
  }
  return {
    title: "상대적으로 유리",
    subtitle: "오늘 기준 구매 우선순위",
  };
}

function watchTitle(item: PriceItemWithSignal): {
  title: string;
  subtitle: string;
} {
  if (item.retailGap === "bubble") {
    return {
      title: "소매 거품 주의",
      subtitle: `소매÷도매 ${item.retailMultiple}배 — 관망·직거래 유리`,
    };
  }
  if (item.trendPosition === "high") {
    return {
      title: "고가권 · 관망",
      subtitle: "최근 동향 대비 높은 가격대",
    };
  }
  return {
    title: "오늘은 관망",
    subtitle: "유통마진·시세 부담이 큰 편",
  };
}

/**
 * 추천 3: 가격 동향·유통마진 기준으로 담기 좋은 품목
 * 관망 3: 소매 거품·고가권 등 당장 사기 부담인 품목
 * 두 목록은 서로 다른 품목만 담는다.
 */
export function buildTodayPickGroups(
  items: PriceItemWithSignal[],
  limit = 3,
): TodayPickGroups {
  if (!items.length) return { buys: [], watches: [] };

  const byBuy = [...items].sort((a, b) => buyScore(a) - buyScore(b));
  const byWatch = [...items].sort((a, b) => watchScore(b) - watchScore(a));

  const buys: TodayPick[] = [];
  const used = new Set<string>();

  for (const item of byBuy) {
    if (buys.length >= limit) break;
    // 추천에는 심한 거품 품목을 넣지 않음
    if (item.retailGap === "bubble" && item.trendPosition !== "low") continue;
    used.add(item.id);
    const { title, subtitle } = buyTitle(item, buys.length + 1);
    buys.push({
      kind: "buy",
      rank: buys.length + 1,
      title,
      subtitle,
      item,
    });
  }
  // 부족하면 점수순으로 채움 (그래도 거품만 남은 경우)
  for (const item of byBuy) {
    if (buys.length >= limit) break;
    if (used.has(item.id)) continue;
    used.add(item.id);
    const { title, subtitle } = buyTitle(item, buys.length + 1);
    buys.push({
      kind: "buy",
      rank: buys.length + 1,
      title,
      subtitle,
      item,
    });
  }

  const watches: TodayPick[] = [];
  for (const item of byWatch) {
    if (watches.length >= limit) break;
    if (used.has(item.id)) continue;
    // 관망은 거품·고가·배수 높은 쪽만
    if (
      item.retailGap !== "bubble" &&
      item.trendPosition !== "high" &&
      item.retailMultiple < 2
    ) {
      continue;
    }
    used.add(item.id);
    const { title, subtitle } = watchTitle(item);
    watches.push({
      kind: "watch",
      rank: watches.length + 1,
      title,
      subtitle,
      item,
    });
  }
  for (const item of byWatch) {
    if (watches.length >= limit) break;
    if (used.has(item.id)) continue;
    used.add(item.id);
    const { title, subtitle } = watchTitle(item);
    watches.push({
      kind: "watch",
      rank: watches.length + 1,
      title,
      subtitle,
      item,
    });
  }

  return { buys, watches };
}

/** @deprecated 하위호환 — 그룹 API 사용 */
export function buildTodayPicks(items: PriceItemWithSignal[]): TodayPick[] {
  const { buys, watches } = buildTodayPickGroups(items, 3);
  return [...buys, ...watches];
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
