import type { ProduceCategory } from "../types";

/**
 * KAMIS 일별 부류별 도·소매가격 (action=dailyPriceByCategoryList)
 * 응답(JSON) 각 행: item_name, rank, unit, dpr1(당일가), dpr7(평년 가격) 등.
 *   - 도매(02)의 dpr7 → 평년 기준가 (나침반 baseline)
 *   - 소매(01)의 dpr1 → 소매가 (유통 거품 지표)
 *
 * NOTE: 실데이터 필드/래퍼 구조는 발급 키로 응답을 받아 최종 확인 필요.
 */

const ENDPOINT = "https://www.kamis.or.kr/service/price/xml.do";

export const KAMIS_CATEGORY_CODE: Record<ProduceCategory, string> = {
  채소: "200",
  과일: "400",
  수산: "600",
};

export interface KamisRow {
  itemName: string;
  today: number; // dpr1
  normalYear: number; // dpr7 (평년)
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

/** KAMIS JSON(파싱된 객체) → KamisRow[] (순수 함수, 테스트 대상) */
export function parseKamisRows(json: unknown): KamisRow[] {
  const items = extractItems(json);
  const rows: KamisRow[] = [];
  for (const it of items) {
    const itemName = toStr(it.item_name ?? it.itemname ?? it.productName);
    if (!itemName || itemName === "평균") continue;
    rows.push({
      itemName,
      today: toNum(it.dpr1),
      normalYear: toNum(it.dpr7),
    });
  }
  return rows;
}

async function fetchCategory(
  clsCode: "01" | "02",
  categoryCode: string,
  dateISO: string,
): Promise<KamisRow[] | null> {
  const certKey = process.env.KAMIS_CERT_KEY;
  const certId = process.env.KAMIS_CERT_ID;
  if (!certKey || !certId) return null;

  const params = new URLSearchParams({
    action: "dailyPriceByCategoryList",
    p_product_cls_code: clsCode,
    p_item_category_code: categoryCode,
    p_country_code: "",
    p_regday: dateISO,
    p_convert_kg_yn: "Y",
    p_cert_key: certKey,
    p_cert_id: certId,
    p_returntype: "json",
  });
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return parseKamisRows(await res.json());
  } catch {
    return null;
  }
}

export interface KamisPrice {
  baseline?: number; // 도매 평년가 (dpr7)
  retailPerKg?: number; // 소매 당일가 (dpr1, kg 환산)
}

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
      if (kind === "wholesale" && row.normalYear) cur.baseline = row.normalYear;
      if (kind === "retail" && row.today) cur.retailPerKg = row.today;
      map.set(row.itemName, cur);
    }
  }
  return map.size ? map : null;
}
