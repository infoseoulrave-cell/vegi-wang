/**
 * aT(한국농수산식품유통공사) 전국 공영도매시장 실시간 경매정보
 * data.go.kr/data/15141808 — 도매시장 통합홈페이지 이관 API (serviceKey 인증)
 *
 * 요청: apis.data.go.kr/B552895/openapi/service/MallRltmInfoService/getMallRltmInfo
 *   serviceKey, pageNo, numOfRows, saleDate(YYYY-MM-DD), whsalCd(가락=110001), type=json
 * 응답(JSON): response.body.items.item[] — 품목/등급/단위/거래량/경락가/정산일자.
 *   품목 코드/명은 표준코드 API(15141818)로 확인. 컬럼명은 명세서 기준 최종 확인 필요이므로
 *   파서는 여러 후보 키를 관대하게 수용한다.
 */

import { weightedPerKg } from "./unit";

const ENDPOINT =
  "http://apis.data.go.kr/B552895/openapi/service/MallRltmInfoService/getMallRltmInfo";

/** 가락도매시장 코드 (표준코드 기준) */
export const GARAK_WHSAL_CD = "110001";

export interface AtAuctionRow {
  itemName: string;
  price: number;
  qty: number;
  unit: string;
  grade: string;
  origin: string;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function toStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function firstStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const s = toStr(o[k]);
    if (s) return s;
  }
  return "";
}
function firstNum(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const n = toNum(o[k]);
    if (n) return n;
  }
  return 0;
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
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Record<string, unknown>[];
    if (c && typeof c === "object") return [c as Record<string, unknown>];
  }
  return [];
}

/** aT 응답(파싱된 JSON) → AtAuctionRow[] (순수 함수, 테스트 대상) */
export function parseAtItems(json: unknown): AtAuctionRow[] {
  const items = extractItems(json);
  const rows: AtAuctionRow[] = [];
  for (const it of items) {
    // 품목명: 소분류 우선(예: 배추) → 중분류
    const itemName = firstStr(it, [
      "gdsSclsfNm",
      "gds_sclsf_nm",
      "sclsfNm",
      "gdsMclsfNm",
      "pumNm",
      "itemName",
    ]);
    // 경락가: 단량당 경락가/평균가 후보
    const price = firstNum(it, [
      "cost",
      "avgPrc",
      "sbidPric",
      "cprc",
      "price",
      "amt",
    ]);
    if (!itemName || !price) continue;
    rows.push({
      itemName,
      price,
      qty: firstNum(it, ["qty", "totQty", "sanchulYange", "gdsQty"]),
      unit: firstStr(it, ["unitNm", "unit_nm", "unitCd", "danqUnit"]),
      grade: firstStr(it, ["grdNm", "grd_nm", "grade"]),
      origin: firstStr(it, ["plorNm", "plor_nm", "sanji", "origin"]),
    });
  }
  return rows;
}

/** 품목명별 **원/kg**(거래단량 정규화 + 수량 가중)로 집계 (순수 함수, 테스트 대상) */
export function aggregateAtPerKg(rows: AtAuctionRow[]): Map<string, number> {
  const byName = new Map<string, AtAuctionRow[]>();
  for (const r of rows) {
    const arr = byName.get(r.itemName) ?? [];
    arr.push(r);
    byName.set(r.itemName, arr);
  }
  const out = new Map<string, number>();
  for (const [name, list] of byName) {
    const perKg = weightedPerKg(list);
    if (perKg != null) out.set(name, perKg);
  }
  return out;
}

/**
 * 가락시장 오늘 경락가를 품목명 기준 **원/kg**로 조회한다.
 * DATA_GO_KR_SERVICE_KEY 가 없거나 실패하면 null.
 */
export async function fetchAtAuction(
  dateISO: string,
  whsalCd: string = GARAK_WHSAL_CD,
): Promise<Map<string, number> | null> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    serviceKey: key,
    pageNo: "1",
    numOfRows: "1000",
    saleDate: dateISO,
    whsalCd,
    type: "json",
  });
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const agg = aggregateAtPerKg(parseAtItems(await res.json()));
    return agg.size ? agg : null;
  } catch {
    return null;
  }
}
