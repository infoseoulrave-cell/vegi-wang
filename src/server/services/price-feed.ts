import { withSignal } from "@/lib/compass";
import { getPriceFeed as getLivePriceFeed } from "@/lib/prices";
import { SAMPLE_ITEMS } from "@/lib/sample-data";
import { fetchKamisPrices } from "@/lib/sources/kamis";
import type { PriceFeed, PriceItem } from "@/lib/types";
import { getEnv } from "@/server/config/env";
import { todayKST, yesterdayKST } from "@/server/domain/date";
import type { Repositories } from "@/server/repos/types";
import { seedCatalog } from "@/server/services/catalog";

function pickByName<T>(map: Map<string, T>, name: string): T | undefined {
  if (map.has(name)) return map.get(name);
  const base = name.replace(/\(.*?\)/g, "").trim();
  if (map.has(base)) return map.get(base);
  for (const [k, v] of map) {
    if (k === base || k.includes(base) || base.includes(k)) return v;
  }
  return undefined;
}

/**
 * DB에 당일 daily_item_price가 있으면 DB+KAMIS로 피드 구성.
 * 없으면 기존 실시간 어댑터(getLivePriceFeed)로 폴백.
 */
export async function getServedPriceFeed(
  repos: Repositories,
  dateISO?: string,
): Promise<PriceFeed & { storage: "db" | "live" }> {
  const saleDate = dateISO ?? todayKST();
  const marketCode = getEnv().defaultMarketCode;
  const windowDays = getEnv().baselineWindowDays;

  await seedCatalog(repos);

  const daily = await repos.auction.getDaily(marketCode, saleDate);
  if (!daily.length) {
    const live = await getLivePriceFeed(saleDate);
    return { ...live, storage: "live" };
  }

  const prevDate = yesterdayKST(saleDate);
  const prevDaily = await repos.auction.getDaily(marketCode, prevDate);
  const baselines = await repos.auction.listBaselines(
    marketCode,
    saleDate,
    windowDays,
  );

  const todayMap = new Map(daily.map((d) => [d.itemName, d]));
  const prevMap = new Map(prevDaily.map((d) => [d.itemName, d]));
  const baselineByItemId = new Map(baselines.map((b) => [b.itemId, b]));

  const categories = SAMPLE_ITEMS.map((i) => i.category);
  const kamis = await fetchKamisPrices(categories, saleDate);

  let retailLive = false;
  const items = SAMPLE_ITEMS.map((base): PriceItem => {
    const d =
      pickByName(todayMap, base.name) ??
      daily.find((x) => x.itemId === base.id);
    const p =
      pickByName(prevMap, base.name) ??
      prevDaily.find((x) => x.itemId === base.id);
    const bl = baselineByItemId.get(base.id);
    const k = kamis ? pickByName(kamis, base.name) : undefined;
    if (k?.retailPerKg) retailLive = true;

    return {
      ...base,
      auctionPrice: d?.avgPrice ?? base.auctionPrice,
      auctionPrevPrice: p?.avgPrice ?? base.auctionPrevPrice,
      auctionBaseline:
        bl?.avgPrice ?? k?.baseline ?? base.auctionBaseline,
      retailPricePerKg: k?.retailPerKg ?? base.retailPricePerKg,
      auctionUnit: d?.unit || base.auctionUnit,
      grade: d?.grade || base.grade,
      origin: d?.origin || base.origin,
    };
  }).map(withSignal);

  return {
    date: saleDate,
    market: "서울 가락동 농수산물도매시장",
    auctionSource: "live",
    retailSource: retailLive ? "live" : "sample",
    items,
    storage: "db",
  };
}
