import {
  atRowPerKg,
  GARAK_WHSAL_CD,
  parseAtItems,
  type AtAuctionRow,
} from "@/lib/sources/atMarket";
import {
  GARAK_CORP_CODES,
  parseGarakJson,
  type GarakRow,
} from "@/lib/sources/garak";
import {
  parseFishMarketRows,
  rowPerKg,
  type FishMarketRow,
} from "@/lib/sources/fishMarket";
import { parseUnitKg } from "@/lib/sources/unit";
import { garakQueryNames } from "@/lib/catalog";
import { getEnv, preferredAuctionSource } from "@/server/config/env";
import { todayKST } from "@/server/domain/date";
import {
  buildNaturalKey,
  type AuctionIngestSource,
  type IngestResult,
  type RawAuctionRecord,
} from "@/server/domain/models";
import type { Repositories } from "@/server/repos/types";
import {
  seedCatalog,
  FISH_MARKET,
  GARAK_MARKET,
} from "@/server/services/catalog";
import { aggregateSaleDate } from "@/server/services/aggregate";

const AT_ENDPOINT =
  "http://apis.data.go.kr/B552895/openapi/service/MallRltmInfoService/getMallRltmInfo";
const GARAK_JSON =
  "http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do";
/** 해양수산부 위판장별 위탁판매 현황 (공공데이터포털 15056856) */
const FISH_ENDPOINT =
  "http://apis.data.go.kr/1192000/select0040List/getselect0040List";

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
      corpName: r.marketName || null,
      itemName: r.itemName,
      itemVariety: null,
      unit: r.unit || null,
      grade: r.grade || null,
      origin: r.origin || null,
      qty: r.qty || null,
      price: r.price,
      // 축은 어댑터가 정한다 — 여기서 다시 계산하지 않는다
      unitKg: parseUnitKg(r.unit || ""),
      pricePerKg: atRowPerKg(r),
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
  const out: AtAuctionRow[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const params = new URLSearchParams({
      serviceKey: key,
      pageNo: String(page),
      numOfRows: "1000",
      saleDate,
      whsalCd: marketCode,
      type: "json",
    });
    const res = await fetch(`${AT_ENDPOINT}?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`aT HTTP ${res.status}`);
    const text = await res.text();
    if (text.trimStart().startsWith("<")) break;
    const rows = parseAtItems(JSON.parse(text));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
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

  /*
   * 법인 6곳은 서로 독립이므로 병렬로 조회한다.
   * 순차로 돌면 품목당 6번의 왕복이 직렬로 쌓여 수집 전체가 타임아웃 난다
   * (실제로 /api/cron/ingest가 60초 한도에서 504로 죽었다).
   */
  const perCorp = await Promise.all(
    GARAK_CORP_CODES.map(async (bubin) => {
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
        const res = await fetch(`${GARAK_JSON}?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) return [];
        const rows = parseGarakJson(await res.json());
        return rows.map((r) => ({ ...r, corpCode: bubin }));
      } catch {
        return []; // 법인 단위 실패는 스킵
      }
    }),
  );
  for (const rows of perCorp) out.push(...rows);
  return out;
}

/**
 * 위판 행 → 원천 레코드.
 *
 * price/unit은 응답 원문(단가·상자 등)을 그대로 보존하고, 집계가 쓰는
 * pricePerKg는 **금액÷중량**으로 만든다. 원문 단가는 goodsUnitNm에 따라
 * 기준이 달라 그대로 나누면 축이 깨진다.
 */
function fishToRaw(
  rows: FishMarketRow[],
  saleDate: string,
  marketCode: string,
): RawAuctionRecord[] {
  return rows.map((r, idx) => {
    const perKg = rowPerKg(r);
    // 한 거래단위당 중량 — 표시용. 수량이 없으면 알 수 없다.
    const unitKg = r.qty > 0 && r.weightKg > 0 ? r.weightKg / r.qty : null;
    const base = {
      marketCode,
      corpCode: r.marketName || null,
      itemName: r.itemName,
      unit: r.unitName || null,
      grade: r.spec || null,
      saleDate,
      seq: `${r.marketName}-${idx}`,
      price: r.unitPrice,
    };
    return {
      naturalKey: buildNaturalKey(base),
      saleDate,
      marketCode,
      corpCode: null,
      corpName: r.marketName || null,
      itemName: r.itemName,
      itemVariety: r.condition || null,
      unit: r.unitName || null,
      grade: r.spec || null,
      origin: r.origin || null,
      qty: r.qty || null,
      price: r.unitPrice,
      unitKg: unitKg != null ? Math.round(unitKg * 1000) / 1000 : null,
      pricePerKg: perKg,
      source: "fish_market" as const,
      payload: { ...r },
    };
  });
}

async function fetchFishRows(saleDate: string): Promise<FishMarketRow[]> {
  if (!getEnv().dataGoKrServiceKey) return [];
  const out: FishMarketRow[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const params = new URLSearchParams({
      serviceKey: getEnv().dataGoKrServiceKey!,
      numOfRows: "1000",
      pageNo: String(page),
      type: "json",
      baseDt: saleDate.replace(/-/g, ""),
    });
    try {
      const res = await fetch(`${FISH_ENDPOINT}?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) break;
      const text = await res.text();
      if (text.trimStart().startsWith("<")) break;
      const rows = parseFishMarketRows(JSON.parse(text));
      out.push(...rows);
      if (rows.length < 1000) break;
    } catch {
      break;
    }
  }
  return out;
}

/**
 * 수산 위판장 수집 — 가락과 시장 코드가 다르므로 별도 파이프라인이다.
 * 실패해도 청과 수집을 막지 않는다.
 */
export async function ingestFishMarket(
  repos: Repositories,
  saleDate: string,
): Promise<{ rowsFetched: number; rowsUpserted: number; dailyUpserted: number }> {
  const marketCode = FISH_MARKET.code;
  await repos.catalog.ensureMarket(FISH_MARKET);

  const runId = await repos.ingestRuns.start({
    saleDate,
    marketCode,
    source: "fish_market",
  });

  try {
    const rows = await fetchFishRows(saleDate);
    if (!rows.length) {
      await repos.ingestRuns.finish(runId, {
        status: "empty",
        rowsFetched: 0,
        rowsUpserted: 0,
        errorMessage: "위판 데이터 없음 (휴장일 또는 serviceKey 미설정)",
      });
      return { rowsFetched: 0, rowsUpserted: 0, dailyUpserted: 0 };
    }

    const raw = fishToRaw(rows, saleDate, marketCode);
    const rowsUpserted = await repos.auction.upsertRaw(raw);
    const { dailyUpserted } = await aggregateSaleDate(
      repos,
      marketCode,
      saleDate,
      getEnv().baselineWindowDays,
    );

    await repos.ingestRuns.finish(runId, {
      status: "success",
      rowsFetched: rows.length,
      rowsUpserted,
    });
    return { rowsFetched: rows.length, rowsUpserted, dailyUpserted };
  } catch (err) {
    await repos.ingestRuns.finish(runId, {
      status: "failed",
      rowsFetched: 0,
      rowsUpserted: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { rowsFetched: 0, rowsUpserted: 0, dailyUpserted: 0 };
  }
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
      /*
       * 가락은 청과 법인만 조회한다 — 수산까지 던지면 있을 리 없는 품목에
       * 법인 6곳씩 헛질의를 보내 시간만 쓴다.
       */
      const names = garakQueryNames();

      // 전량 동시 호출은 레이트리밋·타임아웃을 부른다. 배치로 나눈다.
      const flat: Array<GarakRow & { corpCode: string }> = [];
      const BATCH = 6;
      for (let i = 0; i < names.length; i += BATCH) {
        const chunk = names.slice(i, i + BATCH);
        const results = await Promise.all(
          chunk.map((n) => fetchGarakRowsForItem(n, saleDate)),
        );
        for (const rows of results) flat.push(...rows);
      }
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

    // 수산은 시장 코드가 달라 별도 파이프라인으로 돈다. 실패해도 청과를 막지 않는다.
    const fish = await ingestFishMarket(repos, saleDate);

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
      rowsFetched: rows.length + fish.rowsFetched,
      rowsUpserted: rowsUpserted + fish.rowsUpserted,
      dailyUpserted: dailyUpserted + fish.dailyUpserted,
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
