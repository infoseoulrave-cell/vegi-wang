import { BUBBLE_MIN } from "./compass";
import { everydayItems } from "./catalog-focus";
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

/**
 * 절약 바구니 점수 — 높을수록 ‘오늘 사면 아낀다’.
 *
 * 잘못된 기존 로직: savingPerUnit 절대값만 정렬 → 소매 거품이 클수록 1위.
 * 올바른 역할: 최근 시세가 부담 없고(저·중위), 유통마진도 과도하지 않은데
 * 소매 대비 실질 절약률이 있는 품목.
 */
export function savingsBasketScore(item: PriceItemWithSignal): number {
  if (item.savingPerUnit <= 0) return Number.NEGATIVE_INFINITY;
  // 거품·고가권은 관망 섹션 몫 — 절약 바구니에서 제외
  if (item.retailGap === "bubble" || item.retailMultiple >= BUBBLE_MIN) {
    return Number.NEGATIVE_INFINITY;
  }
  if (item.trendPosition === "high") return Number.NEGATIVE_INFINITY;

  const saveRate = item.savingPerUnit / Math.max(item.consumerRetailPrice, 1);
  const trendBonus = (100 - item.trendPercentile) / 100;
  // 절약률 중심 + 저가권 가산 (절대 원액은 보조)
  const absNorm = Math.min(item.savingPerUnit / 8000, 1);
  return saveRate * 0.5 + trendBonus * 0.35 + absNorm * 0.15;
}

/** 오늘 절약 바구니 — 일상 생식품 · 거품 제외 · 절약률·저가권 기준 */
export function buildSavingsBasket(
  items: PriceItemWithSignal[],
  limit = 8,
): PriceItemWithSignal[] {
  const pool = everydayItems(items);
  return [...pool]
    .filter((i) => Number.isFinite(savingsBasketScore(i)))
    .sort((a, b) => savingsBasketScore(b) - savingsBasketScore(a))
    .slice(0, limit);
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
 * 추천 3 / 관망 3 — 사람들이 자주 사는 생식품만 후보.
 * 두 목록은 서로 다른 품목만 담는다.
 */
export function buildTodayPickGroups(
  items: PriceItemWithSignal[],
  limit = 3,
): TodayPickGroups {
  const pool = everydayItems(items);
  if (!pool.length) return { buys: [], watches: [] };

  const byBuy = [...pool].sort((a, b) => buyScore(a) - buyScore(b));
  const byWatch = [...pool].sort((a, b) => watchScore(b) - watchScore(a));

  const buys: TodayPick[] = [];
  const used = new Set<string>();

  for (const item of byBuy) {
    if (buys.length >= limit) break;
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
