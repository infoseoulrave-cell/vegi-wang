import type { ProduceCategory } from "../types";

/**
 * 네이버 쇼핑 검색 API (openapi.naver.com/v1/search/shop.json)
 * → 온라인 소매가 밴드(원/kg)
 *
 * 중요 — 이 소스는 KAMIS 소매가의 대체재가 아니다.
 *   KAMIS 소매가 : 전국 오프라인 소매점 조사 표본, 규격·등급 통제됨
 *   네이버 쇼핑   : 온라인 산지직송 판매가, 규격 미통제 · 택배비 포함여부 혼재
 * 따라서 별도 채널(source='naver')로 저장하고, 항상 점추정이 아니라
 * 밴드(p25~p75) + 표본수 + 변동계수(cv) + 신뢰등급을 함께 남긴다.
 *
 * 실측(2026-07, 10개 품목 각 100건): 정제 후 평균 CV 0.41, 품목별 0.14~0.87.
 * CV가 큰 품목은 confidence='low'로 내려가며 서빙에서 제외하는 것을 전제로 한다.
 */

const ENDPOINT = "https://openapi.naver.com/v1/search/shop.json";

/** 생식품이 아님 — 소매가 비교 대상에서 제외 */
const EXCLUDE_PROCESSED =
  /절임|김치|즙|분말|가루|건조|말린|냉동|통조림|피클|장아찌|소스|양념|진액|엑기스|추출|씨앗|종자|모종|묘목|비료|영양제|사료|퇴비|칩|스낵|과자|음료|주스|잼|식초|오일|기름/;

/** 국산 소매가와 다른 상품군 */
const EXCLUDE_IMPORT =
  /수입|중국산|미국산|칠레산|페루산|베트남|필리핀|뉴질랜드|호주산/;

const RE_KG = /(\d+(?:\.\d+)?)\s*(?:kg|KG|Kg|킬로|키로)/g;
const RE_G = /(\d+(?:\.\d+)?)\s*(?:g|G|그램)(?![a-zA-Z])/g;

export interface NaverShopItem {
  title: string;
  lprice: string;
  mallName?: string;
}

export interface RetailBand {
  /** 대표값 — 중앙값 (원/kg) */
  pricePerKg: number;
  p25PerKg: number;
  p75PerKg: number;
  sampleSize: number;
  /** 변동계수 = 표준편차/평균. 낮을수록 신뢰 */
  cv: number;
  confidence: "high" | "medium" | "low";
}

export function stripTags(title: string): string {
  return title.replace(/<\/?b>/g, "").trim();
}

/**
 * 중량 표기가 **정확히 하나**일 때만 kg을 반환한다.
 *
 * "3kg 5kg 10kg" 같은 옵션 상품은 lprice가 어느 옵션의 가격인지 알 수 없어
 * 원/kg 환산이 불가능하다. 실측에서 이런 제목이 최대 오차 원인이었다.
 */
export function singleWeightKg(title: string): number | null {
  const kgs = [...title.matchAll(RE_KG)].map((m) => Number(m[1]));
  const gs = [...title.matchAll(RE_G)]
    .map((m) => Number(m[1]))
    .filter((g) => g >= 50); // 50g 미만은 중량 표기가 아닐 확률이 높다

  let kg: number;
  if (kgs.length === 1 && gs.length === 0) {
    kg = kgs[0];
  } else if (kgs.length === 0 && gs.length === 1) {
    kg = gs[0] / 1000;
  } else {
    return null;
  }
  return kg >= 0.1 && kg <= 30 ? kg : null;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/** 중앙값절대편차(MAD) 기반 이상치 제거 — 실측에서 CV를 가장 크게 낮춘 단계 */
export function madFilter(values: number[], k = 3): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const mad = median([...values].map((v) => Math.abs(v - med)).sort((a, b) => a - b));
  if (mad === 0) return values;
  return values.filter((v) => Math.abs(v - med) / mad <= k);
}

export function gradeConfidence(
  sampleSize: number,
  cv: number,
): RetailBand["confidence"] {
  if (sampleSize >= 15 && cv <= 0.35) return "high";
  if (sampleSize >= 8 && cv <= 0.6) return "medium";
  return "low";
}

/**
 * 검색 결과 → 원/kg 밴드.
 * varietyExclude: 같은 검색어에 섞여 들어오는 유사 품종을 걷어내는 패턴
 *   (예: '배추' 검색 시 알배기·쌈배추·얼갈이)
 */
export function toRetailBand(
  items: NaverShopItem[],
  varietyExclude?: RegExp,
): RetailBand | null {
  const perKg: number[] = [];

  for (const it of items) {
    const title = stripTags(it.title);
    if (EXCLUDE_PROCESSED.test(title)) continue;
    if (EXCLUDE_IMPORT.test(title)) continue;
    if (varietyExclude?.test(title)) continue;

    const kg = singleWeightKg(title);
    if (kg == null) continue;

    const price = Number(it.lprice);
    if (!Number.isFinite(price) || price <= 0) continue;

    perKg.push(price / kg);
  }

  const cleaned = madFilter(perKg);
  if (cleaned.length < 4) return null;

  const sorted = [...cleaned].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance =
    sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
  const cv = mean ? Math.sqrt(variance) / mean : 0;

  return {
    pricePerKg: Math.round(median(sorted)),
    p25PerKg: Math.round(quantile(sorted, 0.25)),
    p75PerKg: Math.round(quantile(sorted, 0.75)),
    sampleSize: sorted.length,
    cv: Math.round(cv * 1000) / 1000,
    confidence: gradeConfidence(sorted.length, cv),
  };
}

function credentials() {
  const id = process.env.NAVER_CLIENT_ID?.trim() || null;
  const secret = process.env.NAVER_CLIENT_SECRET?.trim() || null;
  return id && secret ? { id, secret } : null;
}

export function hasNaverShopCredentials(): boolean {
  return credentials() != null;
}

/** 단일 품목 조회. 자격증명이 없거나 실패하면 null (호출측에서 폴백) */
export async function fetchNaverRetailBand(
  query: string,
  varietyExclude?: RegExp,
): Promise<RetailBand | null> {
  const cred = credentials();
  if (!cred) return null;

  const url = `${ENDPOINT}?${new URLSearchParams({
    query,
    display: "100",
    sort: "sim",
  })}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": cred.id,
        "X-Naver-Client-Secret": cred.secret,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: NaverShopItem[] };
    if (!json.items?.length) return null;
    return toRetailBand(json.items, varietyExclude);
  } catch {
    return null;
  }
}

/** 품목별 유사품종 제외 패턴 — 검색어만으로 분리되지 않는 것들 */
export const VARIETY_EXCLUDE: Record<string, RegExp> = {
  배추: /알배기|알배추|쌈배추|쌈추|얼갈이|열무|봄동|청경채/,
  무: /알타리|총각무|열무|비트|콜라비|당근|참마/,
  양파: /자색|적양파|샬롯/,
  대파: /쪽파|실파|양파/,
  당근: /미니당근/,
  감자: /고구마|히카마|얌빈|전분/,
  오이: /오이지|피클|오이맛/,
  토마토: /방울|대추|짭짤이|대저/,
  사과: /아오리|풋사과|시나노/,
  고구마: /감자|말랭이|맛탕/,
};

export interface NaverRetailQuery {
  itemId: string;
  itemName: string;
  category: ProduceCategory;
  query: string;
}

/** 여러 품목 순차 조회 — 레이트리밋 완화를 위해 소배치 */
export async function fetchNaverRetailBands(
  targets: NaverRetailQuery[],
  batchSize = 5,
): Promise<Map<string, RetailBand>> {
  const out = new Map<string, RetailBand>();
  if (!hasNaverShopCredentials()) return out;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const bands = await Promise.all(
      batch.map((t) =>
        fetchNaverRetailBand(t.query, VARIETY_EXCLUDE[t.itemName]),
      ),
    );
    batch.forEach((t, j) => {
      const b = bands[j];
      if (b) out.set(t.itemId, b);
    });
  }
  return out;
}
