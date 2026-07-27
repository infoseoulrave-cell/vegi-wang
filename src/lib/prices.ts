import { withSignal } from "./compass";
import { SAMPLE_ITEMS } from "./sample-data";
import { fetchGarakAuction } from "./sources/garak";
import { fetchKamisPrices, type KamisPrice } from "./sources/kamis";
import type { PriceFeed, PriceItem } from "./types";

/**
 * 오늘의 시세 피드 = [가락시장 경락가(공공데이터포털)] + [KAMIS 평년가·소매가] 조합.
 *
 * 필드별 데이터 소스:
 *  - auctionPrice / auctionPrevPrice ← 가락시장 경매결과 (오늘 / 전일)
 *  - auctionBaseline(평년 기준가)     ← KAMIS 도매 dpr7(평년가)
 *  - retailPricePerKg(소매가)         ← KAMIS 소매 dpr1(kg 환산)
 *
 * 각 값은 SAMPLE_ITEMS 위에 오버레이되며, 키가 없거나 실패하면 해당 값만 샘플을 유지한다.
 */

function todayKST(): Date {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** API 품목명과 내부 품목명 매칭 (예: "사과(후지)" ↔ "사과") */
function pickByName<T>(map: Map<string, T> | null, name: string): T | undefined {
  if (!map) return undefined;
  if (map.has(name)) return map.get(name);
  const base = name.replace(/\(.*?\)/g, "").trim();
  if (map.has(base)) return map.get(base);
  for (const [k, v] of map) {
    if (k === base || k.includes(base) || base.includes(k)) return v;
  }
  return undefined;
}

export async function getPriceFeed(): Promise<PriceFeed> {
  const today = todayKST();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const todayISO = iso(today);
  const yestISO = iso(yesterday);

  const categories = SAMPLE_ITEMS.map((i) => i.category);

  // 가락 경락가(오늘/전일) + KAMIS(평년·소매)를 병렬 조회
  const [auctionToday, auctionPrev, kamis] = await Promise.all([
    Promise.all(SAMPLE_ITEMS.map((i) => fetchGarakAuction(i.name, todayISO))),
    Promise.all(SAMPLE_ITEMS.map((i) => fetchGarakAuction(i.name, yestISO))),
    fetchKamisPrices(categories, todayISO),
  ]);

  let auctionLive = false;
  let retailLive = false;

  const items = SAMPLE_ITEMS.map((base, idx): PriceItem => {
    const aToday = auctionToday[idx];
    const aPrev = auctionPrev[idx];
    const k: KamisPrice | undefined = pickByName(kamis, base.name);

    if (aToday != null) auctionLive = true;
    if (k?.retailPerKg) retailLive = true;

    return {
      ...base,
      auctionPrice: aToday ?? base.auctionPrice,
      auctionPrevPrice: aPrev ?? base.auctionPrevPrice,
      auctionBaseline: k?.baseline ?? base.auctionBaseline,
      retailPricePerKg: k?.retailPerKg ?? base.retailPricePerKg,
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
