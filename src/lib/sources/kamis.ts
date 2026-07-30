import type { PricePoint, ProduceCategory } from "../types";
import { normalizeSeries } from "../trend";
import { parseUnitKg, unitTotalKg } from "./unit";

/**
 * KAMIS 일별 부류별 도·소매가격 (action=dailyPriceByCategoryList)
 * 응답(JSON) 각 행: item_name, rank, unit, dpr1~dpr6(시점별), dpr7(평년) 등.
 *
 * ⚠ 축 규칙 — 2026-07-31 프로덕션 실측으로 확정.
 *   `p_convert_kg_yn=Y`는 **중량 기반 단위의 dpr1~dpr4만** 원/kg로 변환한다.
 *   dpr5(1개월전)·dpr6(1년전)·dpr7(평년)은 변환되지 않고,
 *   개수 기반 단위("1포기", "10개")는 어떤 슬롯도 변환되지 않는다.
 *
 *   근거 (배추 도매, unit="10kg(그물망 3포기)"):
 *     dpr2=1,128 → 원/kg   (같은 날 가락 경락가 1,895원/kg과 정합)
 *     dpr7=13,146 → 원/10kg (÷10 = 1,315원/kg. 원/kg로 읽으면 배추 평년가가
 *                            13,146원/kg이 되어 물리적으로 불가능)
 *   교차 사례: 시금치 소매 unit="100g" dpr2=16,128 → 원/kg (변환됨)
 *             배추 소매 unit="1포기" dpr2=4,018 → 원/포기 (변환 안 됨)
 *
 *   이 규칙을 무시하고 dpr1~dpr6을 한 시계열로 합치면 두 축이 섞여
 *   편차율이 -89%~+218%로 널뛴다. 실제로 그렇게 되어 있었다.
 *
 * 설계: docs/superpowers/specs/2026-07-31-price-axis-and-baseline-design.md
 */

const ENDPOINT = "https://www.kamis.or.kr/service/price/xml.do";

export const KAMIS_CATEGORY_CODE: Record<ProduceCategory, string> = {
  채소: "200",
  과일: "400",
  수산: "600",
};

/** KAMIS 가격 슬롯 */
export type DprSlot =
  | "dpr1"
  | "dpr2"
  | "dpr3"
  | "dpr4"
  | "dpr5"
  | "dpr6"
  | "dpr7";

export const DPR_SLOTS: readonly DprSlot[] = [
  "dpr1",
  "dpr2",
  "dpr3",
  "dpr4",
  "dpr5",
  "dpr6",
  "dpr7",
] as const;

/** `p_convert_kg_yn=Y`가 실제로 원/kg로 변환해 주는 슬롯 (중량 단위 한정) */
export const KG_CONVERTED_SLOTS: ReadonlySet<DprSlot> = new Set<DprSlot>([
  "dpr1",
  "dpr2",
  "dpr3",
  "dpr4",
]);

export interface KamisRow {
  itemName: string;
  rank: string;
  unit: string;
  /** 슬롯별 원시값 — 축 변환 전. 0은 결측(`-`) */
  raw: Record<DprSlot, number>;
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

/** dpr1(당일) → dpr6(1년전) 순으로 첫 유효 숫자가 나오는 슬롯 */
export function latestDailySlot(raw: Record<DprSlot, number>): DprSlot | null {
  for (const key of ["dpr1", "dpr2", "dpr3", "dpr4", "dpr5", "dpr6"] as const) {
    if (raw[key] > 0) return key;
  }
  return null;
}

/**
 * 슬롯 원시값을 원/kg로 환산한다. 환산 근거가 없으면 null — 추정하지 않는다.
 *
 * @param kgPerPiece 개수 기반 단위일 때 1개의 검증된 중량(kg). 카탈로그에서만 온다.
 */
export function resolveKamisPerKg(
  slot: DprSlot,
  value: number,
  unit: string,
  kgPerPiece?: number | null,
): number | null {
  if (!(value > 0)) return null;

  const unitKg = parseUnitKg(unit);
  if (unitKg != null) {
    // 중량 기반 단위 — dpr1~dpr4는 이미 원/kg, 나머지는 거래단위 가격
    if (KG_CONVERTED_SLOTS.has(slot)) return Math.round(value);
    return Math.round(value / unitKg);
  }

  // 개수 기반 단위 — 어떤 슬롯도 변환되지 않는다. 검증된 중량이 있어야만 환산.
  const totalKg = unitTotalKg(unit, kgPerPiece);
  if (totalKg == null || !(totalKg > 0)) return null;
  return Math.round(value / totalKg);
}

/** KAMIS dpr 슬롯 → 기준일로부터의 대략 일수 (공식 라벨 대응) */
const DPR_DAY_OFFSETS: Record<string, number> = {
  dpr1: 0,
  dpr2: 1,
  dpr3: 7,
  dpr4: 14,
  dpr5: 30,
  dpr6: 365,
};

const DPR_LABELS: Record<string, string> = {
  dpr1: "당일",
  dpr2: "1일전",
  dpr3: "1주전",
  dpr4: "2주전",
  dpr5: "1개월전",
  dpr6: "1년전",
};

function shiftDateISO(dateISO: string, daysBack: number): string {
  const d = new Date(`${dateISO}T12:00:00+09:00`);
  d.setTime(d.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * dpr1~dpr6을 **원/kg 축의** 시계열로 변환한다.
 * 축을 환산할 수 없는 슬롯은 넣지 않는다 — 섞느니 비우는 편이 낫다.
 */
export function extractKamisSeriesPerKg(
  row: KamisRow,
  regdayISO: string,
  kgPerPiece?: number | null,
): PricePoint[] {
  const points: PricePoint[] = [];
  for (const key of ["dpr1", "dpr2", "dpr3", "dpr4", "dpr5", "dpr6"] as const) {
    const perKg = resolveKamisPerKg(key, row.raw[key], row.unit, kgPerPiece);
    if (perKg == null) continue;
    points.push({
      date: shiftDateISO(regdayISO, DPR_DAY_OFFSETS[key] ?? 0),
      price: perKg,
      label: DPR_LABELS[key],
    });
  }
  return normalizeSeries(points);
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
export function parseKamisRows(
  json: unknown,
  regdayISO = "2026-01-01",
): KamisRow[] {
  void regdayISO;
  const items = extractItems(json);
  const rows: KamisRow[] = [];
  for (const it of items) {
    const itemName = toStr(it.item_name ?? it.itemname ?? it.productName);
    if (!itemName || itemName === "평균") continue;
    const raw = Object.fromEntries(
      DPR_SLOTS.map((s) => [s, toNum(it[s])]),
    ) as Record<DprSlot, number>;
    rows.push({
      itemName,
      rank: toStr(it.rank),
      unit: toStr(it.unit),
      raw,
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
    return pickPreferredRows(parseKamisRows(JSON.parse(text), dateISO));
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
    const rows = pickPreferredRows(parseKamisRows(parsed, dateISO));
    const withToday = rows.filter((r) => latestDailySlot(r.raw) != null).length;
    const withBaseline = rows.filter((r) => r.raw.dpr7 > 0).length;
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

/** KAMIS에서 뽑아낸 값 — **전부 원/kg 축**이다. 환산 불가 항목은 아예 없다. */
export interface KamisPrice {
  /** 도매 평년가(dpr7) 원/kg — 자체 이력이 쌓이기 전 부트스트랩 기준선 */
  baselinePerKg?: number;
  /** 도매 최근 동향 시계열 원/kg */
  seriesPerKg?: PricePoint[];
  /** 소매 최근가 원/kg */
  retailPerKg?: number;
  retailUnit?: string;
  wholesaleUnit?: string;
}

/**
 * 품목명 → 개수 기반 단위 1개의 검증된 중량(kg).
 * 카탈로그가 단일 출처다 — 이 모듈은 자체 힌트 테이블을 갖지 않는다.
 * (과거 CONSUMER_KG_HINT 상수가 카탈로그와 이중 관리되어 값이 갈렸다.)
 */
export type KgPerPieceResolver = (itemName: string) => number | null;

/**
 * 필요한 부류(category)에 대해 도매/소매를 조회하고 품목명 기준으로 합친다.
 * 키가 없거나 전부 실패하면 null.
 */
/** 카탈로그 구축용 — 부류별 실제 조회 품목(상품 우선) + 도·소매 단위 */
export async function listKamisCatalogItems(
  categories: ProduceCategory[],
  dateISO: string,
): Promise<
  | {
      category: ProduceCategory;
      name: string;
      wholesaleUnit: string;
      retailUnit: string;
      hasWholesale: boolean;
      hasRetail: boolean;
    }[]
  | null
> {
  const unique = [...new Set(categories)];
  const out: {
    category: ProduceCategory;
    name: string;
    wholesaleUnit: string;
    retailUnit: string;
    hasWholesale: boolean;
    hasRetail: boolean;
  }[] = [];

  for (const cat of unique) {
    const code = KAMIS_CATEGORY_CODE[cat];
    const [wholesale, retail] = await Promise.all([
      fetchCategory("02", code, dateISO),
      fetchCategory("01", code, dateISO),
    ]);
    if (wholesale === null && retail === null) continue;

    const names = new Set<string>();
    const wMap = new Map<string, KamisRow>();
    const rMap = new Map<string, KamisRow>();
    for (const r of wholesale ?? []) {
      names.add(r.itemName);
      wMap.set(r.itemName, r);
    }
    for (const r of retail ?? []) {
      names.add(r.itemName);
      rMap.set(r.itemName, r);
    }
    for (const name of names) {
      const w = wMap.get(name);
      const r = rMap.get(name);
      const hasWholesale = Boolean(
        w && (latestDailySlot(w.raw) != null || w.raw.dpr7 > 0),
      );
      const hasRetail = Boolean(r && latestDailySlot(r.raw) != null);
      if (!hasWholesale && !hasRetail) continue;
      out.push({
        category: cat,
        name,
        wholesaleUnit: w?.unit ?? "",
        retailUnit: r?.unit ?? "",
        hasWholesale,
        hasRetail,
      });
    }
  }

  return out.length ? out : null;
}

export async function fetchKamisPrices(
  categories: ProduceCategory[],
  dateISO: string,
  kgPerPiece: KgPerPieceResolver = () => null,
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
      const kg = kgPerPiece(row.itemName);

      if (kind === "wholesale") {
        cur.wholesaleUnit = row.unit;
        const series = extractKamisSeriesPerKg(row, dateISO, kg);
        if (series.length) cur.seriesPerKg = series;

        // 평년가(dpr7)는 중량 단위에서도 변환되지 않으므로 반드시 축 해석을 거친다.
        const baseline = resolveKamisPerKg("dpr7", row.raw.dpr7, row.unit, kg);
        if (baseline != null) cur.baselinePerKg = baseline;
        else if (series.length) {
          // 평년가가 없을 때만 시리즈 평균으로 대체 — 이미 원/kg 축이다.
          cur.baselinePerKg = Math.round(
            series.reduce((a, p) => a + p.price, 0) / series.length,
          );
        }
      }

      if (kind === "retail") {
        const slot = latestDailySlot(row.raw);
        const perKg = slot
          ? resolveKamisPerKg(slot, row.raw[slot], row.unit, kg)
          : null;
        if (perKg != null) {
          cur.retailPerKg = perKg;
          cur.retailUnit = row.unit;
        }
      }

      map.set(row.itemName, cur);
    }
  }
  return map.size ? map : null;
}
