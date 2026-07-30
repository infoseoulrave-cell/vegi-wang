import { itemQueryName } from "@/lib/catalog";
import { withSignal } from "@/lib/compass";
import { getPriceFeed as getLivePriceFeed, pickByName } from "@/lib/prices";
import { SAMPLE_ITEMS } from "@/lib/sample-data";
import { fetchKamisPrices } from "@/lib/sources/kamis";
import { normalizeSeries } from "@/lib/trend";
import type { PriceFeed, PriceItem, PricePoint } from "@/lib/types";
import { getEnv } from "@/server/config/env";
import { addDaysISO, todayKST, yesterdayKST } from "@/server/domain/date";
import type { Repositories } from "@/server/repos/types";
import { seedCatalog } from "@/server/services/catalog";

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

  const kamis = await fetchKamisPrices(["채소", "과일", "수산"], saleDate);

  let retailLive = false;
  const fromDate = addDaysISO(saleDate, -(windowDays - 1));
  const built: PriceItem[] = [];

  for (const base of SAMPLE_ITEMS) {
    const q = itemQueryName(base);
    const d =
      pickByName(todayMap, base.name) ??
      pickByName(todayMap, q) ??
      daily.find((x) => x.itemId === base.id);
    const p =
      pickByName(prevMap, base.name) ??
      pickByName(prevMap, q) ??
      prevDaily.find((x) => x.itemId === base.id);
    const bl = baselineByItemId.get(base.id);
    const k =
      (kamis ? pickByName(kamis, base.name) : undefined) ??
      (kamis ? pickByName(kamis, q) : undefined);
    if (k?.retailPerKg) retailLive = true;

    const auctionPrice = d?.avgPrice ?? base.auctionPrice;
    const auctionPrevPrice = p?.avgPrice ?? base.auctionPrevPrice;

    // DB 이력이 있으면 우선, 없으면 KAMIS 시리즈
    let history: PricePoint[] = k?.series ? [...k.series] : [];
    try {
      const dbHist = await repos.auction.getDailyByItem(
        marketCode,
        base.name,
        fromDate,
        saleDate,
      );
      if (dbHist.length >= 2) {
        history = dbHist.map((h) => ({
          date: h.saleDate,
          price: h.avgPrice,
        }));
      }
    } catch {
      // memory/empty — KAMIS 시리즈 유지
    }

    history = normalizeSeries([
      ...history,
      { date: saleDate, price: auctionPrice, label: "오늘" },
    ]);

    built.push({
      ...base,
      auctionPrice,
      auctionPrevPrice,
      auctionBaseline: bl?.avgPrice ?? k?.baseline ?? base.auctionBaseline,
      retailPricePerKg: k?.retailPerKg ?? base.retailPricePerKg,
      auctionUnit: d?.unit || base.auctionUnit,
      grade: d?.grade || base.grade,
      origin: d?.origin || base.origin,
      history,
    });
  }

  return {
    date: saleDate,
    market: "서울 가락동 농수산물도매시장",
    auctionSource: "live",
    retailSource: retailLive ? "live" : "sample",
    items: built.map(withSignal),
    storage: "db",
  };
}
