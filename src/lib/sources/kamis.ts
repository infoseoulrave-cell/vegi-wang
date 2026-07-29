import type { ProduceCategory } from "../types";

/**
 * KAMIS 일별 부류별 도·소매가격 (action=dailyPriceByCategoryList)
 * 응답(JSON) 각 행: item_name, rank, unit, dpr1(당일가), dpr7(평년 가격) 등.
 *   - 도매(02)의 dpr7 → 평년 기준가 (나침반 baseline, 거래단위 가격)
 *   - 소매(01)의 최근 유효 dpr → 소매가 (가능하면 원/kg로 정규화)
 *
 * 주의: 당일(dpr1)·전일(dpr2)이 "-"인 날이 있어 dpr1~dpr6 중 가장 최근 유효값을 사용한다.
 */

const ENDPOINT = "https://www.kamis.or.kr/service/price/xml.do";

export const KAMIS_CATEGORY_CODE: Record<ProduceCategory, string> = {
  채소: "200",
  과일: "400",
  수산: "600",
};

export interface KamisRow {
  itemName: string;
  rank: string;
  unit: string;
  /** dpr1~dpr6 중 가장 최근 유효 일별가 */
  today: number;
  /** dpr7 평년가 */
  normalYear: number;
}

export interface KamisProbeResult {
  ok: boolean;
  status: number | null;
  contentType: string | null;
  itemCount: number;
  error?: string;
  snippet?: string;
  sampleFields?: Record<string, unknown> | null;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.trim() === "-" || v.trim() === "") return 0;
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function toStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** dpr1(당일) → dpr6(1년전) 순으로 첫 유효 숫자 */
export function latestDailyPrice(it: Record<string, unknown>): number {
  for (const key of ["dpr1", "dpr2", "dpr3", "dpr4", "dpr5", "dpr6"] as const) {
    const n = toNum(it[key]);
    if (n > 0) return n;
  }
  return 0;
}

/**
 * KAMIS 단위 문자열을 원/kg로 정규화.
 * - "1kg", "10kg ..." → 명시 kg로 나눔
 * - "1포기"/"1개"/"1단" 등 + 힌트 kg → 힌트로 나눔
 * - 힌트 없으면 원가 그대로(호출측에서 거래단위 비교용으로 쓸 수 있음)
 */
export function normalizeKamisPriceToPerKg(
  price: number,
  unit: string,
  kgHint?: number,
): number {
  if (!price) return 0;
  const m = unit.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (m) {
    const kg = Number(m[1]);
    return kg > 0 ? Math.round(price / kg) : price;
  }
  if (kgHint && kgHint > 0 && /(포기|개|단|마리|팩)/.test(unit)) {
    return Math.round(price / kgHint);
  }
  return price;
}

function extractItems(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const candidates: unknown[] = [
    (d.data as { item?: unknown } | undefined)?.item,
    d.price,
    d.item,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Record<string, unknown>[];
    if (c && typeof c === "object") return [c as Record<string, unknown>];
  }
  return [];
}

function rankScore(rank: string): number {
  if (rank.includes("상품")) return 3;
  if (rank.includes("중품")) return 2;
  if (rank.includes("하품")) return 1;
  return 0;
}

/** KAMIS JSON(파싱된 객체) → KamisRow[] (순수 함수, 테스트 대상) */
export function parseKamisRows(json: unknown): KamisRow[] {
  const items = extractItems(json);
  const rows: KamisRow[] = [];
  for (const it of items) {
    const itemName = toStr(it.item_name ?? it.itemname ?? it.productName);
    if (!itemName || itemName === "평균") continue;
    rows.push({
      itemName,
      rank: toStr(it.rank),
      unit: toStr(it.unit),
      today: latestDailyPrice(it),
      normalYear: toNum(it.dpr7),
    });
  }
  return rows;
}

/**
 * 동일 품목명 여러 등급/단위 중 상품 우선으로 하나만 고른다.
 */
export function pickPreferredRows(rows: KamisRow[]): KamisRow[] {
  const best = new Map<string, KamisRow>();
  for (const row of rows) {
    const prev = best.get(row.itemName);
    if (!prev) {
      best.set(row.itemName, row);
      continue;
    }
    const byRank = rankScore(row.rank) - rankScore(prev.rank);
    if (byRank > 0) {
      best.set(row.itemName, row);
      continue;
    }
    if (byRank === 0) {
      // kg 단위가 있으면 비교·환산에 유리
      const rowKg = /kg/i.test(row.unit) ? 1 : 0;
      const prevKg = /kg/i.test(prev.unit) ? 1 : 0;
      if (rowKg > prevKg) best.set(row.itemName, row);
    }
  }
  return [...best.values()];
}

function hasCredentials(): boolean {
  return Boolean(
    process.env.KAMIS_CERT_KEY?.trim() && process.env.KAMIS_CERT_ID?.trim(),
  );
}

function buildParams(
  clsCode: "01" | "02",
  categoryCode: string,
  dateISO: string,
): URLSearchParams {
  return new URLSearchParams({
    action: "dailyPriceByCategoryList",
    p_product_cls_code: clsCode,
    p_item_category_code: categoryCode,
    p_country_code: "",
    p_regday: dateISO,
    p_convert_kg_yn: "Y",
    p_cert_key: process.env.KAMIS_CERT_KEY!.trim(),
    p_cert_id: process.env.KAMIS_CERT_ID!.trim(),
    p_returntype: "json",
  });
}

const FETCH_HEADERS: HeadersInit = {
  Accept: "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (compatible; VegiWang/1.0; +https://vegi-wang.vercel.app)",
  Referer: "https://www.kamis.or.kr/",
};

async function fetchCategory(
  clsCode: "01" | "02",
  categoryCode: string,
  dateISO: string,
): Promise<KamisRow[] | null> {
  if (!hasCredentials()) return null;

  const params = buildParams(clsCode, categoryCode, dateISO);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: FETCH_HEADERS,
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.includes("Web firewall") || text.trimStart().startsWith("<")) {
      return null;
    }
    return pickPreferredRows(parseKamisRows(JSON.parse(text)));
  } catch {
    return null;
  }
}

/** 운영 진단용 — 시크릿 미노출, HTTP/파싱 상태만 반환 */
export async function probeKamis(
  dateISO: string,
  clsCode: "01" | "02" = "02",
): Promise<KamisProbeResult> {
  if (!hasCredentials()) {
    return {
      ok: false,
      status: null,
      contentType: null,
      itemCount: 0,
      error: "missing_credentials",
    };
  }

  const params = buildParams(clsCode, "200", dateISO);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: FETCH_HEADERS,
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type");
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        contentType,
        itemCount: 0,
        error: "http_error",
        snippet: text.slice(0, 160).replace(/\s+/g, " "),
      };
    }
    if (text.includes("Web firewall") || text.trimStart().startsWith("<")) {
      return {
        ok: false,
        status: res.status,
        contentType,
        itemCount: 0,
        error: "waf_or_html",
        snippet: text.slice(0, 160).replace(/\s+/g, " "),
      };
    }
    const parsed = JSON.parse(text);
    const rows = pickPreferredRows(parseKamisRows(parsed));
    const withToday = rows.filter((r) => r.today > 0).length;
    const withBaseline = rows.filter((r) => r.normalYear > 0).length;
    const names = rows.slice(0, 8).map((r) => `${r.itemName}/${r.unit}`);
    const rawItems = extractItems(parsed);
    const sample =
      rawItems.find((it) => toStr(it.item_name ?? it.itemname) === "배추") ??
      rawItems[0];
    const dprFields = sample
      ? Object.fromEntries(
          Object.entries(sample)
            .filter(([k]) => /dpr|price|item|rank|unit|day/i.test(k))
            .map(([k, v]) => [k, v]),
        )
      : null;
    return {
      ok: rows.length > 0,
      status: res.status,
      contentType,
      itemCount: rows.length,
      error: rows.length ? undefined : "empty_rows",
      snippet: `today>0:${withToday} baseline>0:${withBaseline} names:${names.join(",")}`,
      sampleFields: dprFields,
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      contentType: null,
      itemCount: 0,
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}

export async function probeKamisRetail(dateISO: string): Promise<KamisProbeResult> {
  return probeKamis(dateISO, "01");
}

export interface KamisPrice {
  /** 도매 평년가 — 거래단위 기준(경락 auctionPrice와 동일 축) */
  baseline?: number;
  /** 소매 최근가 (원/kg 정규화 시도) */
  retailPerKg?: number;
  retailUnit?: string;
}

/** 소비자 단위 → 대략 kg (소매 포기/개 환산용 힌트) */
const CONSUMER_KG_HINT: Record<string, number> = {
  배추: 2.8,
  무: 1.8,
  양파: 0.25,
  대파: 1,
  애호박: 0.35,
  토마토: 0.25,
};

/**
 * 필요한 부류(category)에 대해 도매/소매를 조회하고 품목명 기준으로 합친다.
 * 키가 없거나 전부 실패하면 null.
 */
export async function fetchKamisPrices(
  categories: ProduceCategory[],
  dateISO: string,
): Promise<Map<string, KamisPrice> | null> {
  const unique = [...new Set(categories)];
  const jobs = unique.flatMap((cat) => {
    const code = KAMIS_CATEGORY_CODE[cat];
    return [
      fetchCategory("02", code, dateISO).then((rows) => ({
        kind: "wholesale" as const,
        rows,
      })),
      fetchCategory("01", code, dateISO).then((rows) => ({
        kind: "retail" as const,
        rows,
      })),
    ];
  });

  const results = await Promise.all(jobs);
  if (results.every((r) => r.rows === null)) return null;

  const map = new Map<string, KamisPrice>();
  for (const { kind, rows } of results) {
    if (!rows) continue;
    for (const row of rows) {
      const cur = map.get(row.itemName) ?? {};
      if (kind === "wholesale" && row.normalYear) {
        // 경락 auctionPrice는 거래단위 금액이므로, 도매 평년도 거래단위 축을 유지
        cur.baseline = row.normalYear;
      }
      if (kind === "retail" && row.today) {
        const baseName = row.itemName.replace(/\(.*?\)/g, "").trim();
        const hint = CONSUMER_KG_HINT[baseName] ?? CONSUMER_KG_HINT[row.itemName];
        cur.retailPerKg = normalizeKamisPriceToPerKg(row.today, row.unit, hint);
        cur.retailUnit = row.unit;
      }
      map.set(row.itemName, cur);
    }
  }
  return map.size ? map : null;
}
