import { itemQueryName } from "./catalog";
import { withSignal } from "./compass";
import { SAMPLE_ITEMS } from "./sample-data";
import { fetchAtAuction } from "./sources/atMarket";
import { fetchGarakAuction } from "./sources/garak";
import { fetchKamisPrices, type KamisPrice } from "./sources/kamis";
import { normalizeSeries } from "./trend";
import type { PriceFeed, PriceItem, PricePoint } from "./types";

/** 임의 시각을 KST 기준 YYYY-MM-DD로 변환 */
function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** API 품목명과 내부 품목명 매칭 */
export function pickByName<T>(
  map: Map<string, T> | null | undefined,
  name: string,
): T | undefined {
  if (!map) return undefined;
  if (map.has(name)) return map.get(name);
  const base = name.replace(/\(.*?\)/g, "").trim();
  if (map.has(base)) return map.get(base);
  for (const [k, v] of map) {
    if (k === base || k.includes(base) || base.includes(k)) return v;
  }
  return undefined;
}

async function resolveAuctionToday(
  queryNames: string[],
  dateISO: string,
): Promise<Map<string, number> | null> {
  const at = await fetchAtAuction(dateISO);
  if (at) return at;

  // 품목별 가락 조회를 소배치로 — 타임아웃·레이트리밋 완화
  const map = new Map<string, number>();
  const batchSize = 8;
  for (let i = 0; i < queryNames.length; i += batchSize) {
    const batch = queryNames.slice(i, i + batchSize);
    const garak = await Promise.all(
      batch.map((n) => fetchGarakAuction(n, dateISO)),
    );
    batch.forEach((n, j) => {
      const v = garak[j];
      if (v != null) map.set(n, v);
    });
  }
  return map.size ? map : null;
}

function mergeHistory(
  series: PricePoint[] | undefined,
  todayISO: string,
  todayPrice: number,
): PricePoint[] {
  const points = [...(series ?? [])];
  if (todayPrice > 0) {
    points.push({ date: todayISO, price: todayPrice, label: "오늘" });
  }
  return normalizeSeries(points);
}

/** 시리즈에서 오늘 직전 유효가를 전일로 사용 */
function prevFromSeries(
  series: PricePoint[] | undefined,
  todayISO: string,
  fallback: number,
): number {
  if (!series?.length) return fallback;
  const older = [...series]
    .filter((p) => p.date < todayISO && p.price > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  return older[0]?.price ?? fallback;
}

export async function getPriceFeed(dateISO?: string): Promise<PriceFeed> {
  const todayISO = dateISO ?? kstDate(new Date());

  const queryNames = SAMPLE_ITEMS.map(itemQueryName);
  const categories = SAMPLE_ITEMS.map((i) => i.category);

  // 오늘 경락 + KAMIS(시계열·소매) — 전일 가락 전량 재조회는 생략(시리즈로 대체)
  const [auctionToday, kamis] = await Promise.all([
    resolveAuctionToday(queryNames, todayISO),
    fetchKamisPrices(categories, todayISO),
  ]);

  let auctionLive = false;
  let retailLive = false;

  const items = SAMPLE_ITEMS.map((base): PriceItem => {
    const q = itemQueryName(base);
    const aToday =
      pickByName(auctionToday, q) ?? pickByName(auctionToday, base.name);
    const k: KamisPrice | undefined =
      pickByName(kamis, base.name) ?? pickByName(kamis, q);

    if (aToday != null) auctionLive = true;
    if (k?.retailPerKg) retailLive = true;

    const auctionPrice = aToday ?? base.auctionPrice;
    const auctionPrevPrice = prevFromSeries(
      k?.series,
      todayISO,
      base.auctionPrevPrice,
    );

    return {
      ...base,
      auctionPrice,
      auctionPrevPrice,
      auctionBaseline: k?.baseline ?? base.auctionBaseline,
      retailPricePerKg: k?.retailPerKg ?? base.retailPricePerKg,
      history: mergeHistory(k?.series, todayISO, auctionPrice),
    };
  }).map(withSignal);

  return {
    date: todayISO,
    market: "서울 가락동 농수산물도매시장",
    auctionSource: auctionLive ? "live" : "sample",
    retailSource: retailLive ? "live" : "sample",
    items,
  };
}
