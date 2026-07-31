import { XMLParser } from "fast-xml-parser";
import { parseUnitKg } from "./unit";

/**
 * 가락시장 경매결과 (서울시농수산식품공사)
 * 요청(JSON): http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do
 *   (XML: .../dataOpen.do)
 *   id, passwd(발급 고정값), dataid, pagesize, pageidx, portal.templet=false,
 *   s_date(YYYYMMDD, 필수), s_bubin(법인코드, 필수), s_pummok(품목명, 필수), s_sangi(산지, 선택)
 * 응답 행 필드: PUMMOK(품목명) / PUMJONG(품종) / UUN(거래단량) / DDD(등급) /
 *   PPRICE(경락가) / SSANGI(산지) / ADJ_DT(정산일자)
 *
 * s_bubin(법인)이 필수이므로 가락 6개 청과 법인을 순회해 합산한다.
 * 인증정보(id/passwd/dataid)는 절대 코드에 하드코딩하지 않고 환경변수로만 주입한다.
 */

const JSON_ENDPOINT =
  "http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do";

/**
 * 소매 비교용 기준 등급.
 * KAMIS 소매가는 '상품' 기준이므로 도매도 같은 등급으로 맞춰야
 * 거품배수가 등급 차이를 가격 차이로 착각하지 않는다.
 */
export const PREFERRED_GRADE = /(특|상)/;

/** 가락 청과 도매시장법인 코드 */
export const GARAK_CORP_CODES = [
  "11000101", // 서울청과
  "11000102", // 농협(공)
  "11000103", // 중앙청과
  "11000104", // 동부팜청과
  "11000105", // 한국청과
  "11000106", // 대아청과
];

export interface GarakRow {
  pummok: string;
  pumjong: string;
  unit: string;
  grade: string;
  price: number;
  origin: string;
  date: string;
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

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

/** 대소문자 무시하고 키 조회 */
function get(o: Record<string, unknown>, key: string): unknown {
  if (key in o) return o[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(o)) if (k.toLowerCase() === lower) return o[k];
  return undefined;
}

/** 파싱된 객체 트리에서 경락가(PPRICE) 행 객체들을 수집 (XML/JSON 공통) */
function collectRows(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectRows(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj).map((k) => k.toLowerCase());
    if (keys.includes("pprice") || keys.includes("pummok")) out.push(obj);
    for (const v of Object.values(obj)) collectRows(v, out);
  }
}

function rowsToGarak(parsed: unknown): GarakRow[] {
  const raw: Record<string, unknown>[] = [];
  collectRows(parsed, raw);
  const rows: GarakRow[] = [];
  const seen = new Set<Record<string, unknown>>();
  for (const r of raw) {
    if (seen.has(r)) continue;
    seen.add(r);
    const price = toNum(get(r, "PPRICE"));
    const pummok = toStr(get(r, "PUMMOK"));
    if (!price || !pummok) continue;
    rows.push({
      pummok,
      pumjong: toStr(get(r, "PUMJONG")),
      unit: toStr(get(r, "UUN")),
      grade: toStr(get(r, "DDD")),
      price,
      origin: toStr(get(r, "SSANGI")),
      date: toStr(get(r, "ADJ_DT")),
    });
  }
  return rows;
}

/** 경매결과 XML 문자열 → GarakRow[] (순수 함수, 테스트 대상) */
export function parseGarakXml(xml: string): GarakRow[] {
  return rowsToGarak(parser.parse(xml));
}

/** 경매결과 JSON(파싱된 객체) → GarakRow[] (순수 함수, 테스트 대상) */
export function parseGarakJson(json: unknown): GarakRow[] {
  return rowsToGarak(json);
}

/** 품목명별 평균 경락가로 집계 (순수 함수, 테스트 대상) — 상자 단위 그대로 */
export function aggregateByPummok(rows: GarakRow[]): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const cur = acc.get(r.pummok) ?? { sum: 0, n: 0 };
    cur.sum += r.price;
    cur.n += 1;
    acc.set(r.pummok, cur);
  }
  const out = new Map<string, number>();
  for (const [k, { sum, n }] of acc) out.set(k, Math.round(sum / n));
  return out;
}

/**
 * 품목명별 원/kg 평균.
 *
 * 가락 응답은 행마다 UUN(거래단량)을 주므로 **행 단위로 자기완결적 환산**이 된다.
 * 추정이 필요 없다는 점이 KAMIS와 결정적으로 다르고, 그래서 경락가의 유일한 원천이다.
 * UUN이 중량으로 파싱되지 않는 행(마리/속/단)은 집계에서 제외한다 — 추정하지 않는다.
 */
export function aggregateByPummokPerKg(rows: GarakRow[]): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const kg = parseUnitKg(r.unit);
    if (!kg) continue;
    const perKg = r.price / kg;
    if (!(perKg > 0)) continue;
    const cur = acc.get(r.pummok) ?? { sum: 0, n: 0 };
    cur.sum += perKg;
    cur.n += 1;
    acc.set(r.pummok, cur);
  }
  const out = new Map<string, number>();
  for (const [k, { sum, n }] of acc) out.set(k, Math.round(sum / n));
  return out;
}

function ymd(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

async function fetchCorp(
  itemName: string,
  dateISO: string,
  bubin: string,
): Promise<GarakRow[]> {
  const id = process.env.GARAK_API_ID;
  const pw = process.env.GARAK_API_PW;
  const dataid = process.env.GARAK_AUCTION_DATAID;
  if (!id || !pw || !dataid) return [];
  const params = new URLSearchParams({
    id,
    passwd: pw,
    dataid,
    pagesize: "1000",
    pageidx: "1",
    "portal.templet": "false",
    s_date: ymd(dateISO),
    s_bubin: bubin,
    s_pummok: itemName,
    s_sangi: "",
  });
  try {
    const res = await fetch(`${JSON_ENDPOINT}?${params}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    return parseGarakJson(await res.json());
  } catch {
    return [];
  }
}

/**
 * 특정 품목의 특정일 평균 경락가를 **원/kg**로 반환한다 (가락 6개 법인 합산).
 * 실패/무데이터 시 null.
 *
 * 이 함수는 거래단위 가격으로 되돌리지 않는다. 원/kg가 내부 표준축이고,
 * 상자가·1개가는 표시 직전에 곱해서 만든다. (예전에는 여기서 catalogWeightKg를
 * 곱해 되돌렸고, 그 값이 다시 weightKg로 나눠지면서 이중 나눗셈이 발생했다.)
 */
export async function fetchGarakAuctionPerKg(
  itemName: string,
  dateISO: string,
): Promise<number | null> {
  if (!process.env.GARAK_API_ID || !process.env.GARAK_API_PW) return null;
  // s_pummok은 부분매칭이므로 괄호/수식어를 제거한 기본 품목명으로 질의한다.
  const query = itemName.replace(/\(.*?\)/g, "").trim() || itemName;
  const perCorp = await Promise.all(
    GARAK_CORP_CODES.map((b) => fetchCorp(query, dateISO, b)),
  );
  const all = perCorp.flat();
  if (all.length === 0) return null;
  // PUMMOK이 질의어와 정확히 일치하는 품목만 채택(예: "사과" 질의 시 "대추(사과대추)" 배제)
  const exact = all.filter((r) => r.pummok === query || r.pummok === itemName);
  const scoped = exact.length ? exact : all;
  /*
   * 등급을 맞춘다. KAMIS 소매는 pickPreferredRows가 '상품'을 고르는데
   * 여기서 특·상·중·하를 전부 평균내면 도매만 낮게 잡혀 거품배수가
   * 구조적으로 과대평가된다. 상품 등급이 있으면 그것만 쓴다.
   */
  const preferred = scoped.filter((r) => PREFERRED_GRADE.test(r.grade));
  const perKgMap = aggregateByPummokPerKg(
    preferred.length ? preferred : scoped,
  );
  const perKg = perKgMap.get(query) ?? perKgMap.get(itemName) ?? null;
  return perKg != null && perKg > 0 ? perKg : null;
}
