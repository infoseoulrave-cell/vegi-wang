import {
  CATALOG_ITEMS,
  getCatalogItem,
  itemQueryName,
  kgPerConsumerUnitByName,
  lookupBySourceName,
} from "@/lib/catalog";
import { withSignal } from "@/lib/compass";
import { resolveWithCarryForward } from "@/lib/prices";
import { fetchGarakAuctionPerKg } from "@/lib/sources/garak";
import { fetchKamisPrices } from "@/lib/sources/kamis";
import { analyzeTrend, normalizeSeries } from "@/lib/trend";
import type { PriceItemWithSignal, PricePoint } from "@/lib/types";
import { addDaysISO, todayKST } from "@/server/domain/date";

export { getCatalogItem };

export function listCatalogIds(): string[] {
  return CATALOG_ITEMS.map((i) => i.id);
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
 * 단일 품목 가락 일별 경락 시계열 (원/kg).
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
      batch.map((d) => fetchGarakAuctionPerKg(queryName, d)),
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
  /** 경락 시계열 (원/kg) */
  auctionSeries: PricePoint[];
  /** 소비자 단위 환산 시계열 (차트 표시용) */
  consumerSeries: PricePoint[];
  source: {
    auctionHistory: "garak" | "kamis" | "mixed" | "none";
    retail: "live" | "none";
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

/** 원/kg 시리즈 → 소비자 단위 환산 (곱하기만 한다) */
function toConsumerSeries(
  series: PricePoint[],
  kgPerUnit: number,
): PricePoint[] {
  if (!(kgPerUnit > 0)) return series;
  return series.map((p) => ({ ...p, price: Math.round(p.price * kgPerUnit) }));
}

/**
 * 품목 상세: 가락 일별 이력(원/kg) + KAMIS 시리즈/소매를 결합.
 * 실측이 전혀 없으면 null — 샘플로 채우지 않는다.
 */
export async function getItemDetail(
  id: string,
  dateISO?: string,
): Promise<ItemDetail | null> {
  const base = getCatalogItem(id);
  if (!base || !base.unitVerified) return null;

  const today = dateISO ?? todayKST();
  const q = itemQueryName(base);

  const [garakSeries, kamisMap] = await Promise.all([
    fetchGarakHistory(q, today, 21),
    fetchKamisPrices([base.category], today, kgPerConsumerUnitByName),
  ]);

  const k = lookupBySourceName(kamisMap, base);

  // 두 소스 모두 원/kg 축이므로 이제는 안전하게 합칠 수 있다.
  // (예전에는 KAMIS dpr가 거래단위/포기/kg가 섞여 있어 섞으면 차트가 왜곡됐다.)
  let auctionSeries = garakSeries;
  let auctionHistory: ItemDetail["source"]["auctionHistory"] = garakSeries.length
    ? "garak"
    : "none";

  if (garakSeries.length < 3 && k?.seriesPerKg?.length) {
    auctionSeries = normalizeSeries([...k.seriesPerKg, ...garakSeries]);
    auctionHistory = garakSeries.length ? "mixed" : "kamis";
  }

  const todayPerKg =
    auctionSeries.filter((p) => p.date === today).at(-1)?.price ?? null;
  const resolved = resolveWithCarryForward(todayPerKg, auctionSeries, today);
  if (!resolved) return null;

  const prevPerKg =
    [...auctionSeries].reverse().find((p) => p.date < today)?.price ??
    resolved.perKg;

  if (!auctionSeries.some((p) => p.date === today)) {
    auctionSeries = normalizeSeries([
      ...auctionSeries,
      { date: today, price: resolved.perKg, label: "오늘" },
    ]);
  }

  const signal = withSignal({
    ...base,
    auctionPerKg: resolved.perKg,
    auctionPrevPerKg: prevPerKg,
    auctionBaselinePerKg: k?.baselinePerKg ?? 0,
    baselineMethod: k?.baselinePerKg ? "kamis_dpr7" : "none",
    retailPerKg: k?.retailPerKg,
    priceStatus: resolved.status,
    asOfDate: resolved.asOfDate,
    history: auctionSeries,
  });

  const consumerSeries = toConsumerSeries(
    auctionSeries,
    base.kgPerConsumerUnit,
  );
  const trend = analyzeTrend(consumerSeries, signal.consumerAuctionPrice);
  const values = consumerSeries.map((p) => p.price).filter((v) => v > 0);

  return {
    item: signal,
    auctionSeries,
    consumerSeries,
    source: {
      auctionHistory,
      retail: k?.retailPerKg ? "live" : "none",
    },
    stats: {
      latest: signal.consumerAuctionPrice,
      prev: Math.round(prevPerKg * base.kgPerConsumerUnit),
      high: values.length ? Math.max(...values) : signal.consumerAuctionPrice,
      low: values.length ? Math.min(...values) : signal.consumerAuctionPrice,
      avg: trend.avg || signal.consumerAuctionPrice,
      changeRate: signal.changeRate,
      trendPercentile: signal.trendPercentile,
    },
  };
}
