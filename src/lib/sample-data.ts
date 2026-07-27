import type { PriceItem } from "./types";

/**
 * 가락시장 경락가(도매) + KAMIS 소매가를 본뜬 샘플 데이터.
 * 실제 공공데이터 연동 키가 없을 때 플랫폼이 항상 동작하도록 하는 폴백 값.
 *
 * - auction* : 서울시농수산식품공사(가락시장) 경매 낙찰가 (원 / 거래단위)
 * - retailPricePerKg : KAMIS 전국 소매 평균가 (원 / kg)
 * - weightKg : 거래단위의 환산 중량 → 경락가를 원/kg로 바꿔 소매가와 비교
 * - consumerUnit / kgPerConsumerUnit : 소비자 구매 단위(1개 등)와 그 환산 중량
 *   → 소비자는 kg이 아니라 개/포기/마리로 이해하므로 1개 기준가로 노출한다.
 */
export const SAMPLE_ITEMS: PriceItem[] = [
  { id: "cabbage", name: "배추", category: "채소", auctionUnit: "10kg 그물망", weightKg: 10, consumerUnit: "1포기", kgPerConsumerUnit: 2.5, grade: "상", origin: "강원 평창", auctionPrice: 9800, auctionPrevPrice: 11200, auctionBaseline: 12600, retailPricePerKg: 2500 },
  { id: "radish", name: "무", category: "채소", auctionUnit: "20kg 상자", weightKg: 20, consumerUnit: "1개", kgPerConsumerUnit: 1, grade: "상", origin: "충남 당진", auctionPrice: 14200, auctionPrevPrice: 13800, auctionBaseline: 13500, retailPricePerKg: 1800 },
  { id: "onion", name: "양파", category: "채소", auctionUnit: "15kg 망", weightKg: 15, consumerUnit: "1개", kgPerConsumerUnit: 0.25, grade: "상", origin: "전남 무안", auctionPrice: 18500, auctionPrevPrice: 17800, auctionBaseline: 16200, retailPricePerKg: 2900 },
  { id: "green-onion", name: "대파", category: "채소", auctionUnit: "1kg 단", weightKg: 1, consumerUnit: "1단", kgPerConsumerUnit: 1, grade: "상", origin: "전남 진도", auctionPrice: 2600, auctionPrevPrice: 2450, auctionBaseline: 3100, retailPricePerKg: 4900 },
  { id: "potato", name: "감자(수미)", category: "채소", auctionUnit: "20kg 상자", weightKg: 20, consumerUnit: "1개", kgPerConsumerUnit: 0.2, grade: "상", origin: "경북 안동", auctionPrice: 31000, auctionPrevPrice: 30500, auctionBaseline: 34000, retailPricePerKg: 3900 },
  { id: "chili", name: "청양고추", category: "채소", auctionUnit: "4kg 상자", weightKg: 4, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "경남 밀양", auctionPrice: 42000, auctionPrevPrice: 38000, auctionBaseline: 33000, retailPricePerKg: 19000 },
  { id: "zucchini", name: "애호박", category: "채소", auctionUnit: "20개 상자", weightKg: 7, consumerUnit: "1개", kgPerConsumerUnit: 0.35, grade: "상", origin: "경남 진주", auctionPrice: 16800, auctionPrevPrice: 15200, auctionBaseline: 15500, retailPricePerKg: 4300 },
  { id: "cucumber", name: "오이(다다기)", category: "채소", auctionUnit: "100개 상자", weightKg: 20, consumerUnit: "1개", kgPerConsumerUnit: 0.2, grade: "상", origin: "충북 청주", auctionPrice: 38000, auctionPrevPrice: 41000, auctionBaseline: 44000, retailPricePerKg: 4000 },
  { id: "apple", name: "사과(후지)", category: "과일", auctionUnit: "10kg 상자", weightKg: 10, consumerUnit: "1개", kgPerConsumerUnit: 0.3, grade: "특", origin: "경북 청송", auctionPrice: 58000, auctionPrevPrice: 61000, auctionBaseline: 67000, retailPricePerKg: 12000 },
  { id: "pear", name: "배(신고)", category: "과일", auctionUnit: "15kg 상자", weightKg: 15, consumerUnit: "1개", kgPerConsumerUnit: 0.5, grade: "특", origin: "전남 나주", auctionPrice: 72000, auctionPrevPrice: 70000, auctionBaseline: 69000, retailPricePerKg: 9500 },
  { id: "tomato", name: "토마토", category: "과일", auctionUnit: "10kg 상자", weightKg: 10, consumerUnit: "1개", kgPerConsumerUnit: 0.2, grade: "상", origin: "충남 부여", auctionPrice: 26500, auctionPrevPrice: 24000, auctionBaseline: 23000, retailPricePerKg: 6900 },
  { id: "strawberry", name: "딸기(설향)", category: "과일", auctionUnit: "2kg 상자", weightKg: 2, consumerUnit: "1팩(500g)", kgPerConsumerUnit: 0.5, grade: "특", origin: "경남 진주", auctionPrice: 21000, auctionPrevPrice: 22500, auctionBaseline: 26000, retailPricePerKg: 19900 },
  { id: "mackerel", name: "고등어", category: "수산", auctionUnit: "1상자(10kg)", weightKg: 10, consumerUnit: "1마리", kgPerConsumerUnit: 0.4, grade: "상", origin: "부산 위판", auctionPrice: 34000, auctionPrevPrice: 33000, auctionBaseline: 38000, retailPricePerKg: 8900 },
  { id: "squid", name: "물오징어", category: "수산", auctionUnit: "1상자(8kg)", weightKg: 8, consumerUnit: "1마리", kgPerConsumerUnit: 0.25, grade: "상", origin: "동해 위판", auctionPrice: 62000, auctionPrevPrice: 58000, auctionBaseline: 51000, retailPricePerKg: 14000 },
  { id: "shrimp", name: "흰다리새우", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "충남 태안", auctionPrice: 28000, auctionPrevPrice: 27500, auctionBaseline: 29000, retailPricePerKg: 39000 },
];
