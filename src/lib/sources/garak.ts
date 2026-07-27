import { XMLParser } from "fast-xml-parser";

/**
 * 가락시장 경매결과 (서울시농수산식품공사)
 * 요청: http://www.garak.co.kr/publicdata/dataOpen.do
 *   id, passwd, dataid(서비스ID), s_date(YYYYMMDD), s_pummok(품목명), pagesize, pageidx
 * 응답: XML, 반복 행에 PUMMOK(품목명) / PUMJONG(품종) / UUN(거래단량) /
 *   DDD(등급) / PPRICE(경락가) / SSANGI(산지) / ADJ_DT(정산일자)
 *
 * NOTE: 실제 필드/루트 태그는 발급 계정으로 응답을 받아 최종 확인 필요.
 */

const ENDPOINT = "http://www.garak.co.kr/publicdata/dataOpen.do";

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

/** 파싱된 객체 트리에서 PPRICE(경락가)를 가진 행 객체들을 모두 수집한다. */
function collectRows(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectRows(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("PPRICE" in obj || "PUMMOK" in obj) out.push(obj);
    for (const v of Object.values(obj)) collectRows(v, out);
  }
}

/** 경매결과 XML 문자열 → GarakRow[] (순수 함수, 테스트 대상) */
export function parseGarakXml(xml: string): GarakRow[] {
  const parsed = parser.parse(xml);
  const raw: Record<string, unknown>[] = [];
  collectRows(parsed, raw);
  const rows: GarakRow[] = [];
  const seen = new Set<Record<string, unknown>>();
  for (const r of raw) {
    if (seen.has(r)) continue;
    seen.add(r);
    const price = toNum(r.PPRICE);
    const pummok = toStr(r.PUMMOK);
    if (!price || !pummok) continue;
    rows.push({
      pummok,
      pumjong: toStr(r.PUMJONG),
      unit: toStr(r.UUN),
      grade: toStr(r.DDD),
      price,
      origin: toStr(r.SSANGI),
      date: toStr(r.ADJ_DT),
    });
  }
  return rows;
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

/** 특정 품목의 특정일 평균 경락가를 조회한다. 실패 시 null. */
export async function fetchGarakAuction(
  itemName: string,
  dateISO: string,
): Promise<number | null> {
  const id = process.env.GARAK_API_ID;
  const pw = process.env.GARAK_API_PW;
  const dataid = process.env.GARAK_AUCTION_DATAID;
  if (!id || !pw || !dataid) return null;

  const params = new URLSearchParams({
    id,
    passwd: pw,
    dataid,
    pagesize: "1000",
    pageidx: "1",
    "portal.templet": "false",
    s_date: ymd(dateISO),
    s_pummok: itemName,
  });

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const rows = parseGarakXml(await res.text());
    const agg = aggregateByPummok(rows);
    // 정확 일치 우선, 없으면 부분 일치
    if (agg.has(itemName)) return agg.get(itemName)!;
    for (const [k, v] of agg) if (k.includes(itemName)) return v;
    return null;
  } catch {
    return null;
  }
}
