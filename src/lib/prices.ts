import { withSignal } from "./compass";
import { SAMPLE_ITEMS } from "./sample-data";
import { fetchAtAuction } from "./sources/atMarket";
import { fetchGarakAuctionPerKg } from "./sources/garak";
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

/** 임의 시각을 KST 기준 YYYY-MM-DD로 변환 */
function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

/**
 * 특정일 경락가를 품목명→**원/kg** Map으로 해석한다.
 * 우선순위: aT 전국 도매시장(serviceKey) → 가락 경매결과(GARAK 계정) → 없음(null).
 */
async function resolveAuctionPerKg(
  names: string[],
  dateISO: string,
): Promise<Map<string, number> | null> {
  const at = await fetchAtAuction(dateISO);
  if (at) return at;

  const garak = await Promise.all(
    names.map((n) => fetchGarakAuctionPerKg(n, dateISO)),
  );
  const map = new Map<string, number>();
  names.forEach((n, i) => {
    const v = garak[i];
    if (v != null) map.set(n, v);
  });
  return map.size ? map : null;
}

export async function getPriceFeed(dateISO?: string): Promise<PriceFeed> {
  const todayISO = dateISO ?? kstDate(new Date());
  // 정오(KST) 기준으로 전일 계산 → 타임존 경계 오프바이원 방지
  const anchor = new Date(`${todayISO}T12:00:00+09:00`);
  const yestISO = kstDate(new Date(anchor.getTime() - 24 * 60 * 60 * 1000));

  const names = SAMPLE_ITEMS.map((i) => i.name);
  const categories = SAMPLE_ITEMS.map((i) => i.category);

  const [auctionToday, auctionPrev, kamis] = await Promise.all([
    resolveAuctionPerKg(names, todayISO),
    resolveAuctionPerKg(names, yestISO),
    fetchKamisPrices(categories, todayISO),
  ]);

  let auctionLive = false;
  let retailLive = false;

  const items = SAMPLE_ITEMS.map((base): PriceItem => {
    // 라이브 값은 원/kg → 품목의 대표 거래단위(weightKg)로 환산해 경락가 산출
    const perKgToday = pickByName(auctionToday, base.name);
    const perKgPrev = pickByName(auctionPrev, base.name);
    const k: KamisPrice | undefined = pickByName(kamis, base.name);

    if (perKgToday != null) auctionLive = true;
    if (k?.retailPerKg) retailLive = true;

    return {
      ...base,
      auctionPrice:
        perKgToday != null
          ? Math.round(perKgToday * base.weightKg)
          : base.auctionPrice,
      auctionPrevPrice:
        perKgPrev != null
          ? Math.round(perKgPrev * base.weightKg)
          : base.auctionPrevPrice,
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
