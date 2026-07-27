import { withSignal } from "./compass";
import { SAMPLE_ITEMS } from "./sample-data";
import type { PriceFeed, PriceItem } from "./types";

/**
 * 오늘의 시세 피드 = [가락시장 경락가(도매)] + [KAMIS 소매가] 조합.
 *
 * 동작 방식:
 *  - 기준 카탈로그와 평년(30일) 기준가는 SAMPLE_ITEMS 를 사용한다.
 *  - DATA_GO_KR_SERVICE_KEY 가 있으면 가락시장 경매결과로 오늘 경락가를 덮어쓴다.
 *  - KAMIS_CERT_KEY / KAMIS_CERT_ID 가 있으면 KAMIS 소매가로 덮어쓴다.
 *  - 키가 없거나 실패하면 해당 값은 샘플을 유지한다(플랫폼은 항상 동작).
 *
 * NOTE: 라이브 응답 필드 매핑과 평년 기준가(별도 이력)는 실제 인증키로 검증 후 확정 필요.
 */

const KAMIS_ENDPOINT = "https://www.kamis.or.kr/service/price/xml.do";
const GARAK_ENDPOINT =
  "https://apis.data.go.kr/B190001/publicdataapi/service"; // 서울시농수산식품공사 경매결과(예시)

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 가락시장 경매결과 → { 품목명: { price, prev } } */
async function fetchGarakAuction(): Promise<Map<
  string,
  { price: number; prev: number }
> | null> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    serviceKey: key,
    resultType: "json",
    saleDate: todayKST().replace(/-/g, ""),
    marketCode: "110001", // 가락도매시장 (예시)
  });
  try {
    const res = await fetch(`${GARAK_ENDPOINT}?${params}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const rows = extractRows(await res.json());
    const map = new Map<string, { price: number; prev: number }>();
    for (const row of rows) {
      const name = str(row.pumName) || str(row.item_name) || str(row.itemName);
      const price = num(row.avgAmt) || num(row.avgPrice) || num(row.price);
      if (!name || !price) continue;
      map.set(name, { price, prev: num(row.prevAmt) || price });
    }
    return map.size ? map : null;
  } catch {
    return null;
  }
}

/** KAMIS 일별 소매가 → { 품목명: 원/kg } */
async function fetchKamisRetail(): Promise<Map<string, number> | null> {
  const certKey = process.env.KAMIS_CERT_KEY;
  const certId = process.env.KAMIS_CERT_ID;
  if (!certKey || !certId) return null;
  const params = new URLSearchParams({
    action: "dailyPriceByCategoryList",
    p_product_cls_code: "01", // 01: 소매
    p_country_code: "",
    p_regday: todayKST(),
    p_convert_kg_yn: "Y",
    p_item_category_code: "200",
    p_cert_key: certKey,
    p_cert_id: certId,
    p_returntype: "json",
  });
  try {
    const res = await fetch(`${KAMIS_ENDPOINT}?${params}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const rows = extractRows(await res.json());
    const map = new Map<string, number>();
    for (const row of rows) {
      const name = str(row.item_name) || str(row.productName);
      const price = num(row.dpr1) || num(row.price);
      if (!name || !price) continue;
      map.set(name, price);
    }
    return map.size ? map : null;
  } catch {
    return null;
  }
}

function extractRows(data: unknown): Row[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const candidates: unknown[] = [
    d.price,
    (d.data as { item?: unknown })?.item,
    ((d.response as { body?: { items?: { item?: unknown } } })?.body?.items)
      ?.item,
  ];
  for (const c of candidates) if (Array.isArray(c)) return c as Row[];
  return [];
}

export async function getPriceFeed(): Promise<PriceFeed> {
  const [auction, retail] = await Promise.all([
    fetchGarakAuction(),
    fetchKamisRetail(),
  ]);

  const items = SAMPLE_ITEMS.map((base): PriceItem => {
    const a = auction?.get(base.name);
    const r = retail?.get(base.name);
    return {
      ...base,
      auctionPrice: a?.price ?? base.auctionPrice,
      auctionPrevPrice: a?.prev ?? base.auctionPrevPrice,
      retailPricePerKg: r ?? base.retailPricePerKg,
    };
  }).map(withSignal);

  return {
    date: todayKST(),
    market: "서울 가락동 농수산물도매시장",
    auctionSource: auction ? "live" : "sample",
    retailSource: retail ? "live" : "sample",
    items,
  };
}
