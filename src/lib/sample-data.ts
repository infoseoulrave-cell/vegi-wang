import type { PriceItem } from "./types";

/**
 * 가락시장 경매가를 본뜬 샘플 데이터.
 * 실제 공공데이터(KAMIS / 서울시농수산식품공사) 연동 키가 없을 때
 * 플랫폼이 항상 동작하도록 하는 폴백 값이다.
 * 단위는 도매(경매) 거래 단위이며, 가격은 원(₩) 기준.
 */
export const SAMPLE_ITEMS: PriceItem[] = [
  { id: "cabbage", name: "배추", category: "채소", unit: "10kg 그물망", grade: "상", origin: "강원 평창", todayPrice: 9800, prevPrice: 11200, baselinePrice: 12600 },
  { id: "radish", name: "무", category: "채소", unit: "20kg 상자", grade: "상", origin: "충남 당진", todayPrice: 14200, prevPrice: 13800, baselinePrice: 13500 },
  { id: "onion", name: "양파", category: "채소", unit: "15kg 망", grade: "상", origin: "전남 무안", todayPrice: 18500, prevPrice: 17800, baselinePrice: 16200 },
  { id: "green-onion", name: "대파", category: "채소", unit: "1kg 단", grade: "상", origin: "전남 진도", todayPrice: 2600, prevPrice: 2450, baselinePrice: 3100 },
  { id: "potato", name: "감자(수미)", category: "채소", unit: "20kg 상자", grade: "상", origin: "경북 안동", todayPrice: 31000, prevPrice: 30500, baselinePrice: 34000 },
  { id: "chili", name: "청양고추", category: "채소", unit: "4kg 상자", grade: "상", origin: "경남 밀양", todayPrice: 42000, prevPrice: 38000, baselinePrice: 33000 },
  { id: "zucchini", name: "애호박", category: "채소", unit: "20개 상자", grade: "상", origin: "경남 진주", todayPrice: 16800, prevPrice: 15200, baselinePrice: 15500 },
  { id: "cucumber", name: "오이(다다기)", category: "채소", unit: "100개 상자", grade: "상", origin: "충북 청주", todayPrice: 38000, prevPrice: 41000, baselinePrice: 44000 },
  { id: "apple", name: "사과(후지)", category: "과일", unit: "10kg 상자", grade: "특", origin: "경북 청송", todayPrice: 58000, prevPrice: 61000, baselinePrice: 67000 },
  { id: "pear", name: "배(신고)", category: "과일", unit: "15kg 상자", grade: "특", origin: "전남 나주", todayPrice: 72000, prevPrice: 70000, baselinePrice: 69000 },
  { id: "tomato", name: "토마토", category: "과일", unit: "10kg 상자", grade: "상", origin: "충남 부여", todayPrice: 26500, prevPrice: 24000, baselinePrice: 23000 },
  { id: "strawberry", name: "딸기(설향)", category: "과일", unit: "2kg 상자", grade: "특", origin: "경남 진주", todayPrice: 21000, prevPrice: 22500, baselinePrice: 26000 },
  { id: "mackerel", name: "고등어", category: "수산", unit: "1상자(20미)", grade: "상", origin: "부산 위판", todayPrice: 34000, prevPrice: 33000, baselinePrice: 38000 },
  { id: "squid", name: "물오징어", category: "수산", unit: "1상자(8kg)", grade: "상", origin: "동해 위판", todayPrice: 62000, prevPrice: 58000, baselinePrice: 51000 },
  { id: "shrimp", name: "흰다리새우", category: "수산", unit: "1kg", grade: "상", origin: "충남 태안", todayPrice: 28000, prevPrice: 27500, baselinePrice: 29000 },
];
