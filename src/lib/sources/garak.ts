import { XMLParser } from "fast-xml-parser";
import { weightedPerKg } from "./unit";

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
  qty: number;
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
      qty: toNum(get(r, "QTY")),
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

/** 품목명별 평균 경락가로 집계 (순수 함수, 테스트 대상) */
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
 * 특정 품목의 특정일 평균 경락가(가락 6개 법인 합산)를 조회한다. 실패/무데이터 시 null.
 * 인증정보(GARAK_API_ID/PW, GARAK_AUCTION_DATAID)가 없으면 null.
 */
/**
 * 특정 품목의 특정일 **원/kg** 경락가(가락 6개 법인 합산, 거래단량 정규화 + 수량 가중)를 조회한다.
 * 실패/무데이터/인증정보 없음 → null.
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
  // PUMMOK이 질의어와 정확히 일치하는 행만 채택(예: "사과" 질의 시 "대추(사과대추)" 배제)
  const rows = perCorp.flat().filter((r) => r.pummok === query);
  return weightedPerKg(rows);
}
