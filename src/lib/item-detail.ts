import { itemQueryName } from "@/lib/catalog";
import { withSignal } from "@/lib/compass";
import { pickByName } from "@/lib/prices";
import { SAMPLE_ITEMS } from "@/lib/sample-data";
import { fetchGarakAuction } from "@/lib/sources/garak";
import { fetchKamisPrices } from "@/lib/sources/kamis";
import { analyzeTrend, normalizeSeries } from "@/lib/trend";
import type { PriceItemWithSignal, PricePoint } from "@/lib/types";
import { addDaysISO, todayKST } from "@/server/domain/date";

export function getCatalogItem(id: string) {
  return SAMPLE_ITEMS.find((i) => i.id === id) ?? null;
}

export function listCatalogIds(): string[] {
  return SAMPLE_ITEMS.map((i) => i.id);
}

/** 일요일 제외한 최근 N개 영업일(대략) 후보 일자 */
export function recentMarketDateCandidates(
  endISO: string,
  days: number,
): string[] {
  const out: string[] = [];
  let cursor = endISO;
  let guard = 0;
  while (out.length < days && guard < days * 3) {
    const dow = new Date(`${cursor}T12:00:00+09:00`).getDay();
    if (dow !== 0) out.push(cursor); // 일요일 스킵 (가락 휴장)
    cursor = addDaysISO(cursor, -1);
    guard += 1;
  }
  return out;
}

/**
 * 단일 품목 가락 일별 경락 시계열.
 * 상세 페이지 전용 — 품목 1개만 조회하므로 피드 전체보다 부하가 작다.
 */
export async function fetchGarakHistory(
  queryName: string,
  endISO: string,
  days = 30,
): Promise<PricePoint[]> {
  const dates = recentMarketDateCandidates(endISO, days);
  const points: PricePoint[] = [];
  const batchSize = 5;
  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize);
    const prices = await Promise.all(
      batch.map((d) => fetchGarakAuction(queryName, d)),
    );
    batch.forEach((d, j) => {
      const p = prices[j];
      if (p != null && p > 0) points.push({ date: d, price: p });
    });
  }
  return normalizeSeries(points);
}

export interface ItemDetail {
  item: PriceItemWithSignal;
  /** 거래단위 시계열 (차트 원천) */
  auctionSeries: PricePoint[];
  /** 소비자 단위 환산 시계열 (주식 차트 표시용) */
  consumerSeries: PricePoint[];
  source: {
    auctionHistory: "garak" | "kamis" | "mixed" | "sample";
    retail: "live" | "sample";
  };
  stats: {
    latest: number;
    prev: number;
    high: number;
    low: number;
    avg: number;
    changeRate: number;
    trendPercentile: number;
  };
}

function toConsumerSeries(
  series: PricePoint[],
  weightKg: number,
  kgPerUnit: number,
): PricePoint[] {
  if (!weightKg) return series;
  const f = kgPerUnit / weightKg;
  return series.map((p) => ({ ...p, price: Math.round(p.price * f) }));
}

/**
 * 품목 상세: 가락 일별 이력(가능 시) + KAMIS 시리즈/소매를 결합.
 */
export async function getItemDetail(
  id: string,
  dateISO?: string,
): Promise<ItemDetail | null> {
  const base = getCatalogItem(id);
  if (!base) return null;

  const today = dateISO ?? todayKST();
  const q = itemQueryName(base);

  const [garakSeries, kamisMap] = await Promise.all([
    fetchGarakHistory(q, today, 21),
    fetchKamisPrices([base.category], today),
  ]);

  const k =
    pickByName(kamisMap, base.name) ?? pickByName(kamisMap, q) ?? undefined;

  let auctionSeries = garakSeries;
  let auctionHistory: ItemDetail["source"]["auctionHistory"] = garakSeries.length
    ? "garak"
    : "sample";

  // 가락 일별 이력이 충분하면 단위가 다른 KAMIS 시리즈와 섞지 않는다.
  // (KAMIS dpr는 거래단위/포기/kg가 섞여 주식 차트가 왜곡됨)
  if (garakSeries.length < 3 && k?.series?.length) {
    auctionSeries = normalizeSeries([...(k.series ?? []), ...garakSeries]);
    auctionHistory = garakSeries.length ? "mixed" : "kamis";
  }

  const latestAuction =
    auctionSeries.filter((p) => p.date === today).at(-1)?.price ??
    auctionSeries.at(-1)?.price ??
    base.auctionPrice;

  const prevAuction =
    [...auctionSeries].reverse().find((p) => p.date < today)?.price ??
    base.auctionPrevPrice;

  if (!auctionSeries.some((p) => p.date === today) && latestAuction > 0) {
    auctionSeries = normalizeSeries([
      ...auctionSeries,
      { date: today, price: latestAuction, label: "오늘" },
    ]);
  }

  const signal = withSignal({
    ...base,
    auctionPrice: latestAuction,
    auctionPrevPrice: prevAuction,
    auctionBaseline: k?.baseline ?? base.auctionBaseline,
    retailPricePerKg: k?.retailPerKg ?? base.retailPricePerKg,
    history: auctionSeries,
  });

  const consumerSeries = toConsumerSeries(
    auctionSeries,
    base.weightKg,
    base.kgPerConsumerUnit,
  );
  const trend = analyzeTrend(consumerSeries, signal.consumerAuctionPrice);
  const values = consumerSeries.map((p) => p.price).filter((v) => v > 0);
  const prevConsumer = Math.round(
    (prevAuction / base.weightKg) * base.kgPerConsumerUnit,
  );

  return {
    item: signal,
    auctionSeries,
    consumerSeries,
    source: {
      auctionHistory,
      retail: k?.retailPerKg ? "live" : "sample",
    },
    stats: {
      latest: signal.consumerAuctionPrice,
      prev: prevConsumer,
      high: values.length ? Math.max(...values) : signal.consumerAuctionPrice,
      low: values.length ? Math.min(...values) : signal.consumerAuctionPrice,
      avg: trend.avg || signal.consumerAuctionPrice,
      changeRate: signal.changeRate,
      trendPercentile: signal.trendPercentile,
    },
  };
}
