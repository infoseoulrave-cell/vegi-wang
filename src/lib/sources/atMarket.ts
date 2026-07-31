import { parseUnitKg } from "./unit";

/**
 * aT(한국농수산식품유통공사) 전국 공영도매시장 실시간 경매정보
 * 공공데이터포털 15141808 — serviceKey 인증, 전국 32개 도매시장
 *
 * ── 축 ───────────────────────────────────────────────────────
 * **원/kg = 경락가 ÷ parseUnitKg(규격/단위)**, 거래량 가중평균.
 *
 * 가락 어댑터와 같은 방식이다. 응답이 행마다 단위 문자열을 주므로
 * 행 단위로 자기완결적 환산이 되고, 환산 불가 행(개/속/단)은 버린다.
 * 단위를 무시하고 원문 가격을 평균내면 10kg 상자와 20kg 상자가 섞여
 * 무의미한 값이 나온다 — 예전 aggregateAtByItem이 정확히 그랬다.
 *
 * ── ⚠ 필드명 미확정 ─────────────────────────────────────────
 * 15141808의 응답 스키마는 명세서가 **xlsx 첨부**로만 제공되어 웹에서
 * 확인할 수 없었다. 아래 후보 목록은 두 곳의 실제 문서에서 왔다.
 *
 *   1. 농림축산식품 공공데이터포털의 동일 성격 데이터(도매시장 실시간 경락 정보):
 *      SALEDATE / WHSALCD / WHSALNAME / LARGENAME / MIDNAME / SMALLNAME /
 *      COST(경락가) / QTY(물량) / STD(규격·단위) / SANNAME(산지)
 *   2. 15141808 페이지가 명시한 표준코드 필드:
 *      whsl_mrkt_cd / corp_cd / unit_cd / gds_sclsf_cd / grd_cd / plor_cd
 *
 * 매칭 실패는 "값이 틀림"이 아니라 "행이 버려짐"으로 끝나므로 안전하다.
 * 실제 키는 `/api/debug/at-market`이 원시 키 목록과 매칭 결과로 내려준다.
 * 키가 발급되면 그것으로 확정하고 이 주석을 지울 것.
 */

const ENDPOINT =
  "http://apis.data.go.kr/B552895/openapi/service/MallRltmInfoService/getMallRltmInfo";

/** 가락도매시장 표준 도매시장코드 */
export const GARAK_WHSAL_CD = "110001";

/** 응답 필드 후보 — 위 두 문서에서 확인된 이름들 */
export const AT_FIELD_CANDIDATES = {
  itemName: [
    "SMALLNAME",
    "gdsSclsfNm",
    "gds_sclsf_nm",
    "sclsfNm",
    "MIDNAME",
    "gdsMclsfNm",
    "LARGENAME",
    "pumNm",
    "itemName",
  ],
  price: ["COST", "cost", "sbidPric", "avgPrc", "cprc", "price"],
  unit: ["STD", "std", "unitNm", "unit_nm", "danqUnit", "unit"],
  qty: ["QTY", "qty", "delngQy", "delng_qy", "volume"],
  grade: ["GRADENAME", "grdNm", "grd_nm", "grade"],
  origin: ["SANNAME", "plorNm", "plor_nm", "sanji", "origin"],
  marketName: ["WHSALNAME", "whsalNm", "whsl_mrkt_nm"],
  marketCode: ["WHSALCD", "whsalCd", "whsl_mrkt_cd"],
} as const;

export interface AtAuctionRow {
  itemName: string;
  /** 원문 경락가 (거래단위 기준) */
  price: number;
  /** 규격/단위 문자열 */
  unit: string;
  /** 거래량 */
  qty: number;
  grade: string;
  origin: string;
  marketName: string;
  marketCode: string;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s === "-") return 0;
    const n = Number(s.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function toStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** 후보 키를 순서대로 시도하고, 어떤 키가 맞았는지도 알려준다 */
function pick(
  o: Record<string, unknown>,
  keys: readonly string[],
): { value: unknown; key: string | null } {
  for (const k of keys) {
    if (k in o && o[k] != null && toStr(o[k]) !== "") {
      return { value: o[k], key: k };
    }
  }
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const actual = lower.get(k.toLowerCase());
    if (actual && o[actual] != null && toStr(o[actual]) !== "") {
      return { value: o[actual], key: actual };
    }
  }
  return { value: undefined, key: null };
}

function extractItems(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const j = json as Record<string, unknown>;
  const body = (j.response as { body?: unknown } | undefined)?.body as
    | Record<string, unknown>
    | undefined;
  const candidates: unknown[] = [
    (body?.items as { item?: unknown } | undefined)?.item,
    body?.items,
    j.items,
    // MAFRA Grid 형식 (…: { row: [...] })
    ...Object.values(j)
      .filter((v) => v && typeof v === "object" && "row" in (v as object))
      .map((v) => (v as { row?: unknown }).row),
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Record<string, unknown>[];
    if (c && typeof c === "object") return [c as Record<string, unknown>];
  }
  return [];
}

/** aT 응답(파싱된 JSON) → AtAuctionRow[] (순수 함수) */
export function parseAtItems(json: unknown): AtAuctionRow[] {
  const items = extractItems(json);
  const rows: AtAuctionRow[] = [];
  for (const it of items) {
    const itemName = toStr(pick(it, AT_FIELD_CANDIDATES.itemName).value);
    const price = toNum(pick(it, AT_FIELD_CANDIDATES.price).value);
    if (!itemName || !price) continue;
    rows.push({
      itemName,
      price,
      unit: toStr(pick(it, AT_FIELD_CANDIDATES.unit).value),
      qty: toNum(pick(it, AT_FIELD_CANDIDATES.qty).value),
      grade: toStr(pick(it, AT_FIELD_CANDIDATES.grade).value),
      origin: toStr(pick(it, AT_FIELD_CANDIDATES.origin).value),
      marketName: toStr(pick(it, AT_FIELD_CANDIDATES.marketName).value),
      marketCode: toStr(pick(it, AT_FIELD_CANDIDATES.marketCode).value),
    });
  }
  return rows;
}

/** 한 행의 원/kg. 단위를 중량으로 읽을 수 없으면 null — 1kg으로 가정하지 않는다. */
export function atRowPerKg(row: AtAuctionRow): number | null {
  const unitKg = parseUnitKg(row.unit);
  if (unitKg == null || !(unitKg > 0) || !(row.price > 0)) return null;
  return Math.round(row.price / unitKg);
}

export interface AtItemPrice {
  itemName: string;
  /** 거래량 가중평균 원/kg */
  perKg: number;
  /** 집계에 쓰인 행 수 */
  sampleRows: number;
  /** 환산 불가로 버린 행 수 */
  droppedRows: number;
}

/**
 * 품목명별 원/kg (순수 함수).
 *
 * 거래량이 있으면 가중평균, 없으면 단순평균. 단위를 중량으로 읽을 수 없는
 * 행은 제외한다 — 섞으면 상자가와 kg가가 한 평균에 들어간다.
 */
export function aggregateAtPerKg(
  rows: AtAuctionRow[],
): Map<string, AtItemPrice> {
  const acc = new Map<
    string,
    { sum: number; weight: number; n: number; dropped: number }
  >();

  for (const r of rows) {
    const cur = acc.get(r.itemName) ?? { sum: 0, weight: 0, n: 0, dropped: 0 };
    const perKg = atRowPerKg(r);
    if (perKg == null) {
      cur.dropped += 1;
    } else {
      const w = r.qty > 0 ? r.qty : 1;
      cur.sum += perKg * w;
      cur.weight += w;
      cur.n += 1;
    }
    acc.set(r.itemName, cur);
  }

  const out = new Map<string, AtItemPrice>();
  for (const [itemName, a] of acc) {
    if (!(a.weight > 0)) continue;
    out.set(itemName, {
      itemName,
      perKg: Math.round(a.sum / a.weight),
      sampleRows: a.n,
      droppedRows: a.dropped,
    });
  }
  return out;
}

function hasCredentials(): boolean {
  return Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim());
}

function buildParams(
  dateISO: string,
  whsalCd: string,
  pageNo: number,
  numOfRows: number,
) {
  return new URLSearchParams({
    serviceKey: process.env.DATA_GO_KR_SERVICE_KEY!.trim(),
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    saleDate: dateISO,
    whsalCd,
    type: "json",
  });
}

async function fetchPage(
  dateISO: string,
  whsalCd: string,
  pageNo: number,
  numOfRows = 1000,
): Promise<AtAuctionRow[] | null> {
  if (!hasCredentials()) return null;
  try {
    const res = await fetch(
      `${ENDPOINT}?${buildParams(dateISO, whsalCd, pageNo, numOfRows)}`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trimStart().startsWith("<")) return null; // 오류는 XML/HTML로 온다
    return parseAtItems(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * 특정 시장의 특정일 품목별 원/kg.
 * 키가 없거나 무데이터면 null — 샘플로 대체하지 않는다.
 */
export async function fetchAtAuctionPerKg(
  dateISO: string,
  whsalCd: string = GARAK_WHSAL_CD,
  maxPages = 5,
): Promise<Map<string, AtItemPrice> | null> {
  if (!hasCredentials()) return null;

  const all: AtAuctionRow[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const rows = await fetchPage(dateISO, whsalCd, page);
    if (rows === null) break;
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  if (!all.length) return null;

  const agg = aggregateAtPerKg(all);
  return agg.size ? agg : null;
}

export interface AtProbe {
  ok: boolean;
  error?: string;
  rowsFetched: number;
  itemsResolved: number;
  /** 환산 불가로 버려진 행 수 — 크면 unit 필드 매칭이 틀렸을 가능성 */
  rowsDropped: number;
  /** 응답 원시 키 목록 — 필드명 확정용 */
  rawKeys: string[];
  /** 후보 중 실제로 매칭된 키 */
  matchedFields: Record<string, string | null>;
  sample: Array<{
    itemName: string;
    unit: string;
    price: number;
    qty: number;
    derivedPerKg: number | null;
  }>;
}

/**
 * 운영 진단 — 필드명과 축을 라이브 응답으로 확정하기 위한 경로.
 *
 * 확인할 것:
 *   1. rawKeys에 우리가 안 보는 키가 있는가 → AT_FIELD_CANDIDATES 보강
 *   2. matchedFields가 전부 채워졌는가 (특히 unit, price)
 *   3. rowsDropped가 과도한가 → unit 매칭 실패 또는 개수 단위 비중이 큼
 */
export async function probeAtMarket(
  dateISO: string,
  whsalCd: string = GARAK_WHSAL_CD,
): Promise<AtProbe> {
  const empty: AtProbe = {
    ok: false,
    rowsFetched: 0,
    itemsResolved: 0,
    rowsDropped: 0,
    rawKeys: [],
    matchedFields: {},
    sample: [],
  };
  if (!hasCredentials()) {
    return { ...empty, error: "missing_credentials (DATA_GO_KR_SERVICE_KEY)" };
  }

  let raw: unknown;
  try {
    const res = await fetch(
      `${ENDPOINT}?${buildParams(dateISO, whsalCd, 1, 100)}`,
      { cache: "no-store" },
    );
    const text = await res.text();
    if (!res.ok) {
      return {
        ...empty,
        error: `http_${res.status}`,
        rawKeys: [text.slice(0, 200).replace(/\s+/g, " ")],
      };
    }
    if (text.trimStart().startsWith("<")) {
      return {
        ...empty,
        error: "xml_or_html_response",
        rawKeys: [text.slice(0, 200).replace(/\s+/g, " ")],
      };
    }
    raw = JSON.parse(text);
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "unknown" };
  }

  const items = extractItems(raw);
  if (!items.length) return { ...empty, error: "empty_rows" };

  const first = items[0];
  const matchedFields = Object.fromEntries(
    Object.entries(AT_FIELD_CANDIDATES).map(([field, keys]) => [
      field,
      pick(first, keys).key,
    ]),
  );

  const rows = parseAtItems(raw);
  const agg = aggregateAtPerKg(rows);
  const dropped = [...agg.values()].reduce((s, a) => s + a.droppedRows, 0);

  return {
    ok: agg.size > 0,
    rowsFetched: rows.length,
    itemsResolved: agg.size,
    rowsDropped: dropped,
    rawKeys: Object.keys(first),
    matchedFields,
    sample: rows.slice(0, 8).map((r) => ({
      itemName: r.itemName,
      unit: r.unit,
      price: r.price,
      qty: r.qty,
      derivedPerKg: atRowPerKg(r),
    })),
  };
}
