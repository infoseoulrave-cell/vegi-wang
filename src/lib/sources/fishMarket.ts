import type { PricePoint } from "../types";

/**
 * 해양수산부 위판장별 위탁판매 현황 (공공데이터포털 15056856)
 *   요청: http://apis.data.go.kr/1192000/select0040List/getselect0040List
 *   인증: 공공데이터포털 serviceKey (DATA_GO_KR_SERVICE_KEY)
 *
 * ── 왜 이 API인가 ────────────────────────────────────────────
 * 가락 청과 6개 법인만 조회하는 구조라 수산은 경락가 원천이 아예 없었고,
 * 그 자리를 하드코딩 더미가 메우고 있었다. 위판장은 산지 위탁판매 실적이라
 * 수산물의 도매 원천으로 맞다.
 *
 * ── 축 (핵심) ────────────────────────────────────────────────
 * **원/kg = csmtAmount(위판금액) ÷ csmtWt(위판중량)**
 *
 * 단위 문자열을 전혀 파싱하지 않는다. 가락은 UUN을 파싱해야 하고 KAMIS는
 * 슬롯마다 축이 달랐지만, 여기는 금액과 중량이 같은 행에 있으므로
 * 나눗셈 한 번으로 축이 확정된다. 추정이 개입할 여지가 없다.
 *
 * `csmtUntpc`(위판단가)는 `goodsUnitNm`(상자(CS)/마리 등)에 따라 기준이
 * 달라지므로 **대표값으로 쓰지 않는다.** 다만 두 값의 비율이 축 진단에
 * 유용하므로(≈1이면 단가도 원/kg) 교차검증용으로만 보존한다.
 *
 * ⚠ 미검증: DATA_GO_KR_SERVICE_KEY가 아직 발급되지 않아 라이브 응답으로
 * 확인하지 못했다. 특히 csmtWt의 단위(kg 가정)는 실호출로 확정해야 한다.
 * `/api/debug/fish-market`가 그 확인을 위한 진단 경로다.
 * 중량 단위가 kg이 아니면 원/kg가 1000배 어긋나므로 아래 밴드에서 걸린다.
 */

const ENDPOINT =
  "http://apis.data.go.kr/1192000/select0040List/getselect0040List";

/**
 * 수산물 원/kg 상식 범위.
 * csmtWt가 kg이 아닌 단위(톤 등)로 오면 1000배 어긋나 여기서 걸린다.
 * 축 가정이 틀렸을 때 화면이 아니라 게이트에서 먼저 터지게 하는 장치다.
 */
export const FISH_PLAUSIBLE_PER_KG = { min: 300, max: 300_000 } as const;

/** 신선/냉장을 냉동보다 우선한다 (카탈로그가 신선 수산 기준) */
const FRESH_PATTERN = /(신선|냉장|활|생)/;

export interface FishMarketRow {
  /** 위판일자 YYYY-MM-DD */
  saleDate: string;
  /** 조합명 */
  unionName: string;
  /** 위판장명 */
  marketName: string;
  /** 수산물 표준코드 */
  stdCode: string;
  /** 수산물 표준코드명 (품목명) */
  itemName: string;
  /** 상품규격명 (대/중/소 등) */
  spec: string;
  /** 상품단위명 (상자(CS), 마리 등) — 축 계산에는 쓰지 않는다 */
  unitName: string;
  /** 어종상태명 (신선/냉장/냉동) */
  condition: string;
  /** 원산지구분명 */
  origin: string;
  /** 위판수량 */
  qty: number;
  /** 위판중량 (kg 가정 — 라이브 확인 필요) */
  weightKg: number;
  /** 위판단가 (단위 기준이 goodsUnitNm에 따라 달라짐 — 대표값 아님) */
  unitPrice: number;
  /** 위판금액 */
  amount: number;
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

/** 대소문자 무시 키 조회 */
function get(o: Record<string, unknown>, key: string): unknown {
  if (key in o) return o[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(o)) if (k.toLowerCase() === lower) return o[k];
  return undefined;
}

/** YYYYMMDD 또는 YYYY-MM-DD → YYYY-MM-DD */
export function normalizeSaleDate(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 8) return raw;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * 응답 트리에서 위판 행 객체를 수집한다.
 * data.go.kr 서비스마다 래핑(response.body.items.item)이 달라 트리를 훑는다.
 * garak.ts의 collectRows와 같은 방식.
 */
function collectRows(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectRows(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj).map((k) => k.toLowerCase());
    if (keys.includes("mprcstdcodenm") || keys.includes("csmtuntpc")) {
      out.push(obj);
    }
    for (const v of Object.values(obj)) collectRows(v, out);
  }
}

/** 응답(파싱된 객체) → FishMarketRow[] (순수 함수) */
export function parseFishMarketRows(json: unknown): FishMarketRow[] {
  const raw: Record<string, unknown>[] = [];
  collectRows(json, raw);

  const rows: FishMarketRow[] = [];
  const seen = new Set<Record<string, unknown>>();
  for (const r of raw) {
    if (seen.has(r)) continue;
    seen.add(r);
    const itemName = toStr(get(r, "mprcStdCodeNm"));
    if (!itemName) continue;
    rows.push({
      saleDate: normalizeSaleDate(toStr(get(r, "csmtDe"))),
      unionName: toStr(get(r, "mxtrNm")),
      marketName: toStr(get(r, "csmtmktNm")),
      stdCode: toStr(get(r, "mprcStdCode")),
      itemName,
      spec: toStr(get(r, "goodsStndrdNm")),
      unitName: toStr(get(r, "goodsUnitNm")),
      condition: toStr(get(r, "kdfshSttusNm")),
      origin: toStr(get(r, "orgplceSeNm")),
      qty: toNum(get(r, "csmtQy")),
      weightKg: toNum(get(r, "csmtWt")),
      unitPrice: toNum(get(r, "csmtUntpc")),
      amount: toNum(get(r, "csmtAmount")),
    });
  }
  return rows;
}

/**
 * 한 행의 원/kg. 금액이나 중량이 없으면 null — 단가로 대체하지 않는다.
 * (단가는 상자/마리 기준일 수 있어 대체하는 순간 축이 깨진다.)
 */
export function rowPerKg(row: FishMarketRow): number | null {
  if (!(row.amount > 0) || !(row.weightKg > 0)) return null;
  return Math.round(row.amount / row.weightKg);
}

export interface FishSpeciesPrice {
  itemName: string;
  /** 중량 가중평균 원/kg */
  perKg: number;
  /** 집계에 쓰인 총 중량(kg) */
  totalWeightKg: number;
  /** 집계에 쓰인 행 수 */
  sampleRows: number;
  /** 참여한 위판장 수 */
  marketCount: number;
  /**
   * csmtUntpc ÷ (금액÷중량) 중앙값.
   * ≈1이면 위판단가도 원/kg 기준이라는 뜻 — 축 교차검증 지표.
   * null이면 단가가 없어 확인 불가.
   */
  unitPriceRatio: number | null;
  /** 상식 범위를 벗어나 거부됐다면 사유 */
  rejected: string | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

/**
 * 품목별 중량 가중평균 원/kg (순수 함수).
 *
 * 전국 위판장 실적을 합산한다. 단순 평균이 아니라 **총금액 ÷ 총중량**이므로
 * 거래량이 큰 위판장이 자연스럽게 더 반영된다.
 * 신선/냉장 행이 있으면 그것만 쓴다 — 냉동과 섞으면 가격대가 달라진다.
 */
export function aggregateBySpeciesPerKg(
  rows: FishMarketRow[],
): Map<string, FishSpeciesPrice> {
  const byName = new Map<string, FishMarketRow[]>();
  for (const r of rows) {
    if (rowPerKg(r) == null) continue;
    const cur = byName.get(r.itemName) ?? [];
    cur.push(r);
    byName.set(r.itemName, cur);
  }

  const out = new Map<string, FishSpeciesPrice>();
  for (const [itemName, all] of byName) {
    const fresh = all.filter((r) => FRESH_PATTERN.test(r.condition));
    const used = fresh.length ? fresh : all;

    let amount = 0;
    let weight = 0;
    const markets = new Set<string>();
    const ratios: number[] = [];

    for (const r of used) {
      amount += r.amount;
      weight += r.weightKg;
      if (r.marketName) markets.add(r.marketName);
      const per = rowPerKg(r);
      if (per && r.unitPrice > 0) {
        ratios.push(Math.round((r.unitPrice / per) * 100) / 100);
      }
    }
    if (!(weight > 0) || !(amount > 0)) continue;

    const perKg = Math.round(amount / weight);
    const rejected =
      perKg < FISH_PLAUSIBLE_PER_KG.min || perKg > FISH_PLAUSIBLE_PER_KG.max
        ? `상식 범위 밖 — ${perKg}원/kg (허용 ${FISH_PLAUSIBLE_PER_KG.min}~${FISH_PLAUSIBLE_PER_KG.max}). ` +
          "csmtWt 단위가 kg이 아닐 수 있다"
        : null;

    out.set(itemName, {
      itemName,
      perKg,
      totalWeightKg: Math.round(weight * 1000) / 1000,
      sampleRows: used.length,
      marketCount: markets.size,
      unitPriceRatio: median(ratios),
      rejected,
    });
  }
  return out;
}

function hasCredentials(): boolean {
  return Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim());
}

function buildParams(dateISO: string, numOfRows: number, pageNo: number) {
  return new URLSearchParams({
    serviceKey: process.env.DATA_GO_KR_SERVICE_KEY!.trim(),
    numOfRows: String(numOfRows),
    pageNo: String(pageNo),
    type: "json",
    baseDt: dateISO.replace(/-/g, ""),
  });
}

async function fetchPage(
  dateISO: string,
  pageNo: number,
  numOfRows = 1000,
): Promise<FishMarketRow[] | null> {
  if (!hasCredentials()) return null;
  try {
    const res = await fetch(
      `${ENDPOINT}?${buildParams(dateISO, numOfRows, pageNo)}`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    const text = await res.text();
    // 서비스 오류는 XML/HTML로 내려오는 경우가 있다
    if (text.trimStart().startsWith("<")) return null;
    return parseFishMarketRows(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * 특정일 전국 위판장 품목별 원/kg.
 * 키가 없거나 무데이터면 null — 샘플로 대체하지 않는다.
 */
export async function fetchFishMarketPerKg(
  dateISO: string,
  maxPages = 5,
): Promise<Map<string, FishSpeciesPrice> | null> {
  if (!hasCredentials()) return null;

  const all: FishMarketRow[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const rows = await fetchPage(dateISO, page);
    if (rows === null) break;
    all.push(...rows);
    if (rows.length < 1000) break; // 마지막 페이지
  }
  if (!all.length) return null;

  const agg = aggregateBySpeciesPerKg(all);
  return agg.size ? agg : null;
}

export interface FishMarketProbe {
  ok: boolean;
  error?: string;
  rowsFetched: number;
  speciesResolved: number;
  speciesRejected: number;
  /** 위판단가가 원/kg 기준인지 — 1에 가까우면 그렇다 */
  unitPriceRatioMedian: number | null;
  /** 중량 단위 확인용 원시 샘플 (시크릿 미노출) */
  sample: Array<{
    itemName: string;
    unitName: string;
    condition: string;
    qty: number;
    weightKg: number;
    unitPrice: number;
    amount: number;
    derivedPerKg: number | null;
  }>;
  species: FishSpeciesPrice[];
}

/**
 * 운영 진단 — 라이브 응답으로 **축 가정을 확정하기 위한** 경로.
 *
 * 확인할 것:
 *   1. csmtWt가 kg인가 → derivedPerKg가 상식 범위인가
 *   2. csmtUntpc가 원/kg인가 → unitPriceRatioMedian ≈ 1인가
 *   3. mprcStdCodeNm이 카탈로그 품목명과 매칭되는가
 */
export async function probeFishMarket(
  dateISO: string,
): Promise<FishMarketProbe> {
  const empty: FishMarketProbe = {
    ok: false,
    rowsFetched: 0,
    speciesResolved: 0,
    speciesRejected: 0,
    unitPriceRatioMedian: null,
    sample: [],
    species: [],
  };

  if (!hasCredentials()) {
    return { ...empty, error: "missing_credentials (DATA_GO_KR_SERVICE_KEY)" };
  }

  const rows = await fetchPage(dateISO, 1, 200);
  if (rows === null) return { ...empty, error: "fetch_failed_or_non_json" };
  if (!rows.length) return { ...empty, error: "empty_rows", ok: false };

  const agg = aggregateBySpeciesPerKg(rows);
  const species = [...agg.values()];
  const ratios = species
    .map((s) => s.unitPriceRatio)
    .filter((r): r is number => r != null);

  return {
    ok: species.some((s) => !s.rejected),
    rowsFetched: rows.length,
    speciesResolved: species.filter((s) => !s.rejected).length,
    speciesRejected: species.filter((s) => s.rejected).length,
    unitPriceRatioMedian: median(ratios),
    sample: rows.slice(0, 8).map((r) => ({
      itemName: r.itemName,
      unitName: r.unitName,
      condition: r.condition,
      qty: r.qty,
      weightKg: r.weightKg,
      unitPrice: r.unitPrice,
      amount: r.amount,
      derivedPerKg: rowPerKg(r),
    })),
    species: species.slice(0, 40),
  };
}

/** 위판 이력 시계열 (상세 페이지용) — 날짜별 1회 조회 */
export async function fetchFishMarketHistory(
  itemNames: string[],
  dates: string[],
): Promise<Map<string, PricePoint[]>> {
  const out = new Map<string, PricePoint[]>();
  if (!hasCredentials()) return out;

  for (const date of dates) {
    const agg = await fetchFishMarketPerKg(date, 2);
    if (!agg) continue;
    for (const name of itemNames) {
      const hit = agg.get(name);
      if (!hit || hit.rejected) continue;
      const cur = out.get(name) ?? [];
      cur.push({ date, price: hit.perKg });
      out.set(name, cur);
    }
  }
  return out;
}
