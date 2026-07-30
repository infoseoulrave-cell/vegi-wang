import {
  GARAK_WHSAL_CD,
  parseAtItems,
  type AtAuctionRow,
} from "@/lib/sources/atMarket";
import {
  GARAK_CORP_CODES,
  parseGarakJson,
  type GarakRow,
} from "@/lib/sources/garak";
import { parseUnitKg } from "@/lib/sources/unit";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { getEnv, preferredAuctionSource } from "@/server/config/env";
import { todayKST } from "@/server/domain/date";
import {
  buildNaturalKey,
  type AuctionIngestSource,
  type IngestResult,
  type RawAuctionRecord,
} from "@/server/domain/models";
import type { Repositories } from "@/server/repos/types";
import { seedCatalog, GARAK_MARKET } from "@/server/services/catalog";
import { aggregateSaleDate } from "@/server/services/aggregate";

const AT_ENDPOINT =
  "http://apis.data.go.kr/B552895/openapi/service/MallRltmInfoService/getMallRltmInfo";
const GARAK_JSON =
  "http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do";

/**
 * 거래단량 문자열에서 원/kg를 파생한다.
 * 환산할 수 없으면 null — 집계에서 제외되지, 1kg으로 가정되지 않는다.
 */
function derivePerKg(
  price: number,
  unit: string | null,
): { unitKg: number | null; pricePerKg: number | null } {
  const unitKg = unit ? parseUnitKg(unit) : null;
  if (unitKg == null || !(unitKg > 0) || !(price > 0)) {
    return { unitKg, pricePerKg: null };
  }
  return { unitKg, pricePerKg: Math.round(price / unitKg) };
}

function atToRaw(
  rows: AtAuctionRow[],
  saleDate: string,
  marketCode: string,
): RawAuctionRecord[] {
  return rows.map((r, idx) => {
    const base = {
      marketCode,
      corpCode: null as string | null,
      itemName: r.itemName,
      unit: r.unit || null,
      grade: r.grade || null,
      saleDate,
      seq: idx,
      price: r.price,
    };
    return {
      naturalKey: buildNaturalKey(base),
      saleDate,
      marketCode,
      corpCode: null,
      corpName: null,
      itemName: r.itemName,
      itemVariety: null,
      unit: r.unit || null,
      grade: r.grade || null,
      origin: r.origin || null,
      qty: null,
      price: r.price,
      ...derivePerKg(r.price, r.unit || null),
      source: "at" as const,
      payload: { ...r },
    };
  });
}

function garakToRaw(
  rows: Array<GarakRow & { corpCode: string }>,
  saleDate: string,
  marketCode: string,
): RawAuctionRecord[] {
  return rows.map((r, idx) => {
    const base = {
      marketCode,
      corpCode: r.corpCode,
      itemName: r.pummok,
      unit: r.unit || null,
      grade: r.grade || null,
      saleDate,
      seq: `${r.corpCode}-${idx}`,
      price: r.price,
    };
    return {
      naturalKey: buildNaturalKey(base),
      saleDate,
      marketCode,
      corpCode: r.corpCode,
      corpName: null,
      itemName: r.pummok,
      itemVariety: r.pumjong || null,
      unit: r.unit || null,
      grade: r.grade || null,
      origin: r.origin || null,
      qty: null,
      price: r.price,
      ...derivePerKg(r.price, r.unit || null),
      source: "garak" as const,
      payload: { ...r },
    };
  });
}

async function fetchAtRows(
  saleDate: string,
  marketCode: string,
): Promise<AtAuctionRow[]> {
  const key = getEnv().dataGoKrServiceKey;
  if (!key) return [];
  const params = new URLSearchParams({
    serviceKey: key,
    pageNo: "1",
    numOfRows: "1000",
    saleDate,
    whsalCd: marketCode,
    type: "json",
  });
  const res = await fetch(`${AT_ENDPOINT}?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`aT HTTP ${res.status}`);
  return parseAtItems(await res.json());
}

async function fetchGarakRowsForItem(
  itemName: string,
  saleDate: string,
): Promise<Array<GarakRow & { corpCode: string }>> {
  const { id, pw, dataid } = getEnv().garak;
  if (!id || !pw || !dataid) return [];
  const query = itemName.replace(/\(.*?\)/g, "").trim() || itemName;
  const ymd = saleDate.replace(/-/g, "");
  const out: Array<GarakRow & { corpCode: string }> = [];

  for (const bubin of GARAK_CORP_CODES) {
    const params = new URLSearchParams({
      id,
      passwd: pw,
      dataid,
      pagesize: "1000",
      pageidx: "1",
      "portal.templet": "false",
      s_date: ymd,
      s_bubin: bubin,
      s_pummok: query,
      s_sangi: "",
    });
    try {
      const res = await fetch(`${GARAK_JSON}?${params}`, { cache: "no-store" });
      if (!res.ok) continue;
      const rows = parseGarakJson(await res.json());
      for (const r of rows) out.push({ ...r, corpCode: bubin });
    } catch {
      // 법인 단위 실패는 스킵
    }
  }
  return out;
}

async function collectRaw(
  saleDate: string,
  marketCode: string,
): Promise<{ source: AuctionIngestSource | "none"; rows: RawAuctionRecord[] }> {
  const preferred = preferredAuctionSource();

  if (preferred === "at") {
    const atRows = await fetchAtRows(saleDate, marketCode);
    if (atRows.length) {
      return { source: "at", rows: atToRaw(atRows, saleDate, marketCode) };
    }
    // aT 무데이터면 garak 폴백
  }

  if (preferred === "garak" || preferred === "at") {
    if (getEnv().garak.id) {
      const names = CATALOG_ITEMS.map((i) => i.name);
      const batches = await Promise.all(
        names.map((n) => fetchGarakRowsForItem(n, saleDate)),
      );
      const flat = batches.flat();
      if (flat.length) {
        return {
          source: "garak",
          rows: garakToRaw(flat, saleDate, marketCode),
        };
      }
    }
  }

  return { source: "none", rows: [] };
}

export interface IngestOptions {
  saleDate?: string;
  marketCode?: string;
  /** 외부 API 호출 없이 주입된 raw로 드라이런/테스트 */
  dryRows?: RawAuctionRecord[];
  drySource?: AuctionIngestSource;
}

/**
 * 아침 경매가 수집 파이프라인:
 * 1) 카탈로그 시드  2) 원천 fetch+upsert  3) 일별 집계+기준가
 */
export async function runMorningIngest(
  repos: Repositories,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const saleDate = options.saleDate ?? todayKST();
  const marketCode = options.marketCode ?? getEnv().defaultMarketCode;
  const windowDays = getEnv().baselineWindowDays;

  await seedCatalog(repos);
  await repos.catalog.ensureMarket({
    ...GARAK_MARKET,
    code: marketCode,
  });

  let source: AuctionIngestSource | "none" = options.drySource ?? "none";
  let rows: RawAuctionRecord[] = options.dryRows ?? [];

  const runId = await repos.ingestRuns.start({
    saleDate,
    marketCode,
    source: source === "none" ? preferredAuctionSource() : source,
  });

  try {
    if (!options.dryRows) {
      const collected = await collectRaw(saleDate, marketCode);
      source = collected.source;
      rows = collected.rows;
    }

    if (!rows.length) {
      await repos.ingestRuns.finish(runId, {
        status: "empty",
        rowsFetched: 0,
        rowsUpserted: 0,
        errorMessage: "수집 결과 없음 (휴장일 또는 키 미설정 가능)",
      });
      return {
        saleDate,
        marketCode,
        source,
        status: "empty",
        rowsFetched: 0,
        rowsUpserted: 0,
        dailyUpserted: 0,
        baselinesUpserted: 0,
        errorMessage: "수집 결과 없음",
      };
    }

    const rowsUpserted = await repos.auction.upsertRaw(rows);
    const { dailyUpserted, baselinesUpserted } = await aggregateSaleDate(
      repos,
      marketCode,
      saleDate,
      windowDays,
    );

    await repos.ingestRuns.finish(runId, {
      status: "success",
      rowsFetched: rows.length,
      rowsUpserted,
    });

    return {
      saleDate,
      marketCode,
      source,
      status: "success",
      rowsFetched: rows.length,
      rowsUpserted,
      dailyUpserted,
      baselinesUpserted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repos.ingestRuns.finish(runId, {
      status: "failed",
      rowsFetched: rows.length,
      rowsUpserted: 0,
      errorMessage: message,
    });
    return {
      saleDate,
      marketCode,
      source,
      status: "failed",
      rowsFetched: rows.length,
      rowsUpserted: 0,
      dailyUpserted: 0,
      baselinesUpserted: 0,
      errorMessage: message,
    };
  }
}

// 타입 재export 편의
export type { AtAuctionRow };
export { GARAK_WHSAL_CD };
