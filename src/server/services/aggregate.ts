import { addDaysISO } from "@/server/domain/date";
import type {
  DailyItemPrice,
  ItemBaseline,
  RawAuctionRecord,
} from "@/server/domain/models";
import type { Repositories } from "@/server/repos/types";

/**
 * 자체 이동평균 기준선으로 전환하기 위한 최소 표본 일수.
 * 이보다 적으면 이동평균인 척하지 않고 부트스트랩 단계임을 명시한다.
 */
export const MIN_BASELINE_SAMPLE_DAYS = 14;

/**
 * 원천 행 → 품목명별 일별 집계 (순수). **원/kg 축으로만 집계한다.**
 *
 * 가락 응답은 10kg·20kg 상자가가 섞여 오므로 원문 price를 그대로 평균내면
 * 단위가 뒤섞인 무의미한 값이 나온다. pricePerKg가 없는 행(거래단량을
 * 중량으로 환산할 수 없는 행)은 집계에서 제외한다 — 추정하지 않는다.
 */
export function aggregateRawToDaily(
  rows: RawAuctionRecord[],
  itemIdByName: Map<string, string>,
): DailyItemPrice[] {
  type Acc = {
    pricesPerKg: number[];
    volume: number;
    unit: string | null;
    unitKg: number | null;
    grade: string | null;
    origin: string | null;
    source: string;
    marketCode: string;
    saleDate: string;
    itemName: string;
  };
  const map = new Map<string, Acc>();

  for (const r of rows) {
    if (r.pricePerKg == null || !(r.pricePerKg > 0)) continue;
    const key = `${r.saleDate}|${r.marketCode}|${r.itemName}`;
    const cur = map.get(key) ?? {
      pricesPerKg: [],
      volume: 0,
      unit: r.unit,
      unitKg: r.unitKg,
      grade: r.grade,
      origin: r.origin,
      source: r.source,
      marketCode: r.marketCode,
      saleDate: r.saleDate,
      itemName: r.itemName,
    };
    cur.pricesPerKg.push(r.pricePerKg);
    if (r.qty != null) cur.volume += r.qty;
    if (!cur.unit && r.unit) cur.unit = r.unit;
    if (cur.unitKg == null && r.unitKg != null) cur.unitKg = r.unitKg;
    if (!cur.grade && r.grade) cur.grade = r.grade;
    if (!cur.origin && r.origin) cur.origin = r.origin;
    map.set(key, cur);
  }

  const out: DailyItemPrice[] = [];
  for (const acc of map.values()) {
    const avg = Math.round(
      acc.pricesPerKg.reduce((a, b) => a + b, 0) / acc.pricesPerKg.length,
    );
    out.push({
      saleDate: acc.saleDate,
      marketCode: acc.marketCode,
      itemId: itemIdByName.get(acc.itemName) ?? null,
      itemName: acc.itemName,
      avgPricePerKg: avg,
      minPricePerKg: Math.min(...acc.pricesPerKg),
      maxPricePerKg: Math.max(...acc.pricesPerKg),
      volume: acc.volume || null,
      tradeCount: acc.pricesPerKg.length,
      unit: acc.unit,
      unitKg: acc.unitKg,
      grade: acc.grade,
      origin: acc.origin,
      source: acc.source,
      priceStatus: "live",
      asOfDate: null,
    });
  }
  return out;
}

/**
 * 최근 windowDays 일평균 기준가 계산 (순수) — 원/kg.
 *
 * 표본이 MIN_BASELINE_SAMPLE_DAYS 미만이면 null을 반환한다.
 * 이틀치 평균을 "30일 이동평균"이라고 부르지 않기 위해서다.
 * 그 구간에서는 KAMIS 평년가(dpr7)가 부트스트랩 기준선을 맡는다.
 */
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
  if (inWindow.length < MIN_BASELINE_SAMPLE_DAYS) return null;
  const avg = Math.round(
    inWindow.reduce((s, d) => s + d.avgPricePerKg, 0) / inWindow.length,
  );
  return {
    itemId: input.itemId,
    marketCode: input.marketCode,
    windowDays: input.windowDays,
    asOfDate: input.asOfDate,
    avgPricePerKg: avg,
    sampleDays: inWindow.length,
    method: "moving_avg_30",
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
