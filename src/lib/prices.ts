import { withSignal } from "./compass";
import { SAMPLE_ITEMS } from "./sample-data";
import type { PriceFeed, PriceItem } from "./types";

/**
 * 오늘의 경매가 피드를 반환한다.
 *
 * 데이터 소스 우선순위:
 *  1) KAMIS(농수산물유통정보) OpenAPI — 환경변수 KAMIS_CERT_KEY / KAMIS_CERT_ID 가 있을 때
 *  2) 실패 시 샘플 데이터(SAMPLE_ITEMS)로 폴백하여 플랫폼이 항상 동작하도록 보장
 *
 * NOTE: 라이브 연동 시 KAMIS 응답 필드(dpr1/dpr2 등)와 기준가(평년/최근평균) 산출식은
 * 실제 인증키로 응답을 받아 검증한 뒤 매핑을 확정해야 한다.
 */

const KAMIS_ENDPOINT = "https://www.kamis.or.kr/service/price/xml.do";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function fetchLiveItems(): Promise<PriceItem[] | null> {
  const certKey = process.env.KAMIS_CERT_KEY;
  const certId = process.env.KAMIS_CERT_ID;
  if (!certKey || !certId) return null;

  const params = new URLSearchParams({
    action: "dailyPriceByCategoryList",
    p_product_cls_code: "02", // 02: 도매
    p_country_code: "",
    p_regday: todayKST(),
    p_convert_kg_yn: "N",
    p_item_category_code: "200", // 채소류 (예시 카테고리)
    p_cert_key: certKey,
    p_cert_id: certId,
    p_returntype: "json",
  });

  try {
    const res = await fetch(`${KAMIS_ENDPOINT}?${params.toString()}`, {
      // 아침 경매가는 자주 바뀌지 않으므로 10분 캐시
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const items = normalizeKamis(data);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

/** KAMIS 응답을 내부 PriceItem 형태로 방어적으로 변환한다. */
function normalizeKamis(data: unknown): PriceItem[] {
  const rows = extractRows(data);
  const items: PriceItem[] = [];
  for (const row of rows) {
    const name = str(row.item_name) || str(row.productName);
    const today = num(row.dpr1);
    const prev = num(row.dpr2);
    if (!name || !today) continue;
    items.push({
      id: str(row.item_code) || name,
      name,
      category: "채소",
      unit: str(row.unit) || "-",
      grade: str(row.rank) || "상",
      origin: str(row.county_name) || "-",
      todayPrice: today,
      prevPrice: prev || today,
      // 최근 평균이 별도 API이므로, 라이브 검증 전까지는 당일가를 기준으로 근사
      baselinePrice: num(row.dpr7) || prev || today,
    });
  }
  return items;
}

type Row = Record<string, unknown>;

function extractRows(data: unknown): Row[] {
  if (!data || typeof data !== "object") return [];
  const maybe = data as { price?: unknown; data?: { item?: unknown } };
  const candidate = maybe.price ?? maybe.data?.item;
  if (Array.isArray(candidate)) return candidate as Row[];
  return [];
}

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

export async function getPriceFeed(): Promise<PriceFeed> {
  const live = await fetchLiveItems();
  const source = live ? "live" : "sample";
  const items = (live ?? SAMPLE_ITEMS).map(withSignal);
  return {
    date: todayKST(),
    source,
    market: "서울 가락동 농수산물도매시장",
    items,
  };
}
