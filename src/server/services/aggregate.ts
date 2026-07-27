import { addDaysISO } from "@/server/domain/date";
import type {
  DailyItemPrice,
  ItemBaseline,
  RawAuctionRecord,
} from "@/server/domain/models";
import type { Repositories } from "@/server/repos/types";

/** 원천 행 → 품목명별 일별 집계 (순수) */
export function aggregateRawToDaily(
  rows: RawAuctionRecord[],
  itemIdByName: Map<string, string>,
): DailyItemPrice[] {
  type Acc = {
    prices: number[];
    volume: number;
    unit: string | null;
    grade: string | null;
    origin: string | null;
    source: string;
    marketCode: string;
    saleDate: string;
    itemName: string;
  };
  const map = new Map<string, Acc>();

  for (const r of rows) {
    const key = `${r.saleDate}|${r.marketCode}|${r.itemName}`;
    const cur = map.get(key) ?? {
      prices: [],
      volume: 0,
      unit: r.unit,
      grade: r.grade,
      origin: r.origin,
      source: r.source,
      marketCode: r.marketCode,
      saleDate: r.saleDate,
      itemName: r.itemName,
    };
    cur.prices.push(r.price);
    if (r.qty != null) cur.volume += r.qty;
    if (!cur.unit && r.unit) cur.unit = r.unit;
    if (!cur.grade && r.grade) cur.grade = r.grade;
    if (!cur.origin && r.origin) cur.origin = r.origin;
    map.set(key, cur);
  }

  const out: DailyItemPrice[] = [];
  for (const acc of map.values()) {
    const avg = Math.round(
      acc.prices.reduce((a, b) => a + b, 0) / acc.prices.length,
    );
    out.push({
      saleDate: acc.saleDate,
      marketCode: acc.marketCode,
      itemId: itemIdByName.get(acc.itemName) ?? null,
      itemName: acc.itemName,
      avgPrice: avg,
      minPrice: Math.min(...acc.prices),
      maxPrice: Math.max(...acc.prices),
      volume: acc.volume || null,
      tradeCount: acc.prices.length,
      unit: acc.unit,
      grade: acc.grade,
      origin: acc.origin,
      source: acc.source,
    });
  }
  return out;
}

/** 최근 windowDays 일평균 기준가 계산 (순수) */
export function computeBaselines(input: {
  itemId: string;
  marketCode: string;
  asOfDate: string;
  windowDays: number;
  dailyRows: DailyItemPrice[];
}): ItemBaseline | null {
  const from = addDaysISO(input.asOfDate, -(input.windowDays - 1));
  const inWindow = input.dailyRows.filter(
    (d) => d.saleDate >= from && d.saleDate <= input.asOfDate,
  );
  if (!inWindow.length) return null;
  const avg = Math.round(
    inWindow.reduce((s, d) => s + d.avgPrice, 0) / inWindow.length,
  );
  return {
    itemId: input.itemId,
    marketCode: input.marketCode,
    windowDays: input.windowDays,
    asOfDate: input.asOfDate,
    avgPrice: avg,
    sampleDays: inWindow.length,
  };
}

/**
 * raw_auction → daily_item_price → item_baseline
 */
export async function aggregateSaleDate(
  repos: Repositories,
  marketCode: string,
  saleDate: string,
  windowDays: number,
): Promise<{ dailyUpserted: number; baselinesUpserted: number }> {
  const raw = await repos.auction.listRawByDate(marketCode, saleDate);
  const items = await repos.catalog.listItems();
  const itemIdByName = new Map(items.map((i) => [i.name, i.id]));
  // 부분 매칭도 허용
  for (const i of items) {
    const base = i.name.replace(/\(.*?\)/g, "").trim();
    if (!itemIdByName.has(base)) itemIdByName.set(base, i.id);
  }

  const daily = aggregateRawToDaily(raw, itemIdByName);
  const dailyUpserted = await repos.auction.upsertDaily(daily);

  const baselines: ItemBaseline[] = [];
  for (const item of items) {
    const history = await repos.auction.getDailyByItem(
      marketCode,
      item.name,
      addDaysISO(saleDate, -(windowDays - 1)),
      saleDate,
    );
    // 원천 품목명이 카탈로그와 다를 수 있어 daily에서 itemId로도 보조
    const byId = daily.filter((d) => d.itemId === item.id);
    const merged = [...history];
    for (const d of byId) {
      if (!merged.some((m) => m.saleDate === d.saleDate)) merged.push(d);
    }
    const b = computeBaselines({
      itemId: item.id,
      marketCode,
      asOfDate: saleDate,
      windowDays,
      dailyRows: merged,
    });
    if (b) baselines.push(b);
  }

  const baselinesUpserted = await repos.auction.upsertBaselines(baselines);
  return { dailyUpserted, baselinesUpserted };
}
