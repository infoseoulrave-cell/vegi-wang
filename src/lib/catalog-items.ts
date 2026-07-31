import type { CatalogItem } from "./types";

/**
 * 베지왕 품목 카탈로그 — **메타 전용. 가격을 담지 않는다.**
 *
 * 예전 sample-data.ts는 메타와 하드코딩 가격 더미를 한 객체에 담았고,
 * 라이브 조회가 실패하면 그 더미(20,000원 / 19,000원 / 5,000원)가
 * 아무 표시 없이 실시세인 척 노출됐다. 타입 수준에서 그 경로를 없앤다.
 *
 * unitVerified: 거래단위 문자열과 환산중량의 내부 정합성 검사 결과.
 *   false인 품목은 서빙에서 제외된다. 실제 소스 응답과의 대조는
 *   scripts/verify-catalog.mjs가 수행하고 결과를 이 파일에 반영한다.
 *
 * 자동 생성: scripts/gen-catalog.mjs (1회성 변환)
 */
export const CATALOG_ITEMS: CatalogItem[] = [
  // ── 채소 ──────────────────────────────────────────────
  { id: "garlic", name: "깐마늘(국산)", category: "채소", queryName: "깐마늘", auctionUnit: "20kg", weightKg: 20, consumerUnit: "1접", kgPerConsumerUnit: 1.5, grade: "상", origin: "경남 남해", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"20kg\" = 20kg 일치" },
  { id: "perilla-leaf", name: "깻잎", category: "채소", auctionUnit: "2kg", weightKg: 2, consumerUnit: "50g", kgPerConsumerUnit: 0.05, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"2kg\" = 2kg 일치" },
  { id: "carrot", name: "당근", category: "채소", auctionUnit: "20kg", weightKg: 20, consumerUnit: "1개", kgPerConsumerUnit: 0.2, grade: "상", origin: "제주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"20kg\" = 20kg 일치" },
  { id: "melon", name: "멜론", category: "채소", auctionUnit: "8kg", weightKg: 8, consumerUnit: "1개", kgPerConsumerUnit: 1.5, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"8kg\" = 8kg 일치" },
  { id: "radish", name: "무", category: "채소", auctionUnit: "20kg", weightKg: 20, consumerUnit: "1개", kgPerConsumerUnit: 1.8, grade: "상", origin: "충남 당진", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"20kg\" = 20kg 일치" },
  { id: "minari", name: "미나리", category: "채소", auctionUnit: "8kg", weightKg: 8, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"8kg\" = 8kg 일치" },
  { id: "cherry-tomato", name: "방울토마토", category: "채소", auctionUnit: "3kg", weightKg: 3, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"3kg\" = 3kg 일치" },
  { id: "cabbage", name: "배추", category: "채소", auctionUnit: "10kg(그물망 3포기)", weightKg: 10, consumerUnit: "1포기", kgPerConsumerUnit: 2.8, grade: "상", origin: "강원 평창", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg(그물망 3포기)\" = 10kg 일치" },
  { id: "red-chili", name: "붉은고추", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "broccoli", name: "브로콜리", category: "채소", auctionUnit: "8kg", weightKg: 8, consumerUnit: "1개", kgPerConsumerUnit: 0.35, grade: "상", origin: "제주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"8kg\" = 8kg 일치" },
  { id: "lettuce", name: "상추", category: "채소", auctionUnit: "4kg", weightKg: 4, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "충북 진천", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"4kg\" = 4kg 일치" },
  { id: "ginger", name: "생강", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "전북 완주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "watermelon", name: "수박", category: "채소", auctionUnit: "1개", weightKg: 6, consumerUnit: "1개", kgPerConsumerUnit: 6, grade: "상", origin: "충남 부여", unitVerified: false, verificationNote: "KAMIS 도매 단위 \"1개\"가 개수 기반 — 중량 근거를 소스에서 얻을 수 없음" },
  { id: "spinach", name: "시금치", category: "채소", auctionUnit: "4kg", weightKg: 4, consumerUnit: "1단", kgPerConsumerUnit: 0.3, grade: "상", origin: "경기 포천", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"4kg\" = 4kg 일치" },
  { id: "wrap-cabbage", name: "알배기배추", category: "채소", auctionUnit: "8kg", weightKg: 8, consumerUnit: "1포기", kgPerConsumerUnit: 1.5, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"8kg\" = 8kg 일치" },
  { id: "cabbage-wrap", name: "양배추", category: "채소", auctionUnit: "8kg", weightKg: 8, consumerUnit: "1포기", kgPerConsumerUnit: 1.5, grade: "상", origin: "제주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"8kg\" = 8kg 일치" },
  { id: "onion", name: "양파", category: "채소", auctionUnit: "15kg", weightKg: 15, consumerUnit: "1개", kgPerConsumerUnit: 0.25, grade: "상", origin: "전남 무안", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"15kg\" = 15kg 일치" },
  { id: "young-cabbage", name: "얼갈이배추", category: "채소", auctionUnit: "4kg", weightKg: 4, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"4kg\" = 4kg 일치" },
  { id: "yeolmu", name: "열무", category: "채소", auctionUnit: "4kg", weightKg: 4, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"4kg\" = 4kg 일치" },
  { id: "cucumber", name: "오이", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1개", kgPerConsumerUnit: 0.18, grade: "상", origin: "충북 청주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "korean-melon", name: "참외", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1개", kgPerConsumerUnit: 0.4, grade: "상", origin: "경북 성주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "tomato", name: "토마토", category: "채소", auctionUnit: "5kg", weightKg: 5, consumerUnit: "1개", kgPerConsumerUnit: 0.18, grade: "상", origin: "충남 부여", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"5kg\" = 5kg 일치" },
  { id: "green-onion", name: "대파", category: "채소", queryName: "대파", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1단", kgPerConsumerUnit: 1, grade: "상", origin: "전남 진도", aliases: { kamis: ["파"] }, unitVerified: true, verificationNote: "KAMIS 품목명 \"파\"로 매칭 / KAMIS 도매 단위 \"1kg\" = 1kg 일치" },
  { id: "paprika", name: "파프리카", category: "채소", auctionUnit: "5kg", weightKg: 5, consumerUnit: "1개", kgPerConsumerUnit: 0.18, grade: "상", origin: "강원 철원", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"5kg\" = 5kg 일치" },
  { id: "chili", name: "풋고추", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "경남 밀양", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "garlic-bulb", name: "피마늘", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "bell-pepper", name: "피망", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "국내산", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "zucchini", name: "호박", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1개", kgPerConsumerUnit: 0.3, grade: "상", origin: "경남 진주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "potato", name: "감자", category: "채소", auctionUnit: "20kg", weightKg: 20, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "강원", kamisCategoryCode: "100", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"20kg\" = 20kg 일치" },
  { id: "sweet-potato", name: "고구마", category: "채소", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "전남 해남", kamisCategoryCode: "100", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "oyster-mushroom", name: "느타리버섯", category: "채소", auctionUnit: "2kg", weightKg: 2, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "국내산", kamisCategoryCode: "300", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"2kg\" = 2kg 일치" },
  { id: "enoki-mushroom", name: "팽이버섯", category: "채소", auctionUnit: "5kg", weightKg: 5, consumerUnit: "150g", kgPerConsumerUnit: 0.15, grade: "상", origin: "국내산", kamisCategoryCode: "300", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"5kg\" = 5kg 일치" },

  // ── 과일 ──────────────────────────────────────────────
  { id: "tangerine", name: "감귤", category: "과일", auctionUnit: "3kg", weightKg: 3, consumerUnit: "1개", kgPerConsumerUnit: 0.1, grade: "상", origin: "제주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"3kg\" = 3kg 일치" },
  { id: "lemon", name: "레몬", category: "과일", auctionUnit: "17kg", weightKg: 17, consumerUnit: "1개", kgPerConsumerUnit: 0.12, grade: "상", origin: "국내·수입", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"17kg\" = 17kg 일치" },
  { id: "mango", name: "망고", category: "과일", auctionUnit: "5kg", weightKg: 5, consumerUnit: "1개", kgPerConsumerUnit: 0.3, grade: "상", origin: "국내·수입", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"5kg\" = 5kg 일치" },
  { id: "banana", name: "바나나", category: "과일", auctionUnit: "13kg", weightKg: 13, consumerUnit: "1송이", kgPerConsumerUnit: 1.2, grade: "상", origin: "필리핀", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"13kg\" = 13kg 일치" },
  { id: "pear", name: "배", category: "과일", auctionUnit: "15kg", weightKg: 15, consumerUnit: "1개", kgPerConsumerUnit: 0.55, grade: "특", origin: "전남 나주", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"15kg\" = 15kg 일치" },
  { id: "peach", name: "복숭아", category: "과일", auctionUnit: "4kg", weightKg: 4, consumerUnit: "1개", kgPerConsumerUnit: 0.3, grade: "특", origin: "충북 음성", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"4kg\" = 4kg 일치" },
  { id: "apple", name: "사과", category: "과일", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1개", kgPerConsumerUnit: 0.25, grade: "특", origin: "경북 청송", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "avocado", name: "아보카도", category: "과일", auctionUnit: "1개", weightKg: 1, consumerUnit: "1개", kgPerConsumerUnit: 0.3, grade: "상", origin: "국내·수입", unitVerified: false, verificationNote: "KAMIS 도매 시세 없음 (소매 단위 \"1개\"만 존재) — 경락가 원천이 없다" },
  { id: "orange", name: "오렌지", category: "과일", auctionUnit: "18kg", weightKg: 18, consumerUnit: "1개", kgPerConsumerUnit: 0.12, grade: "상", origin: "국내·수입", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"18kg\" = 18kg 일치" },
  { id: "kiwi", name: "참다래", category: "과일", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1개", kgPerConsumerUnit: 0.1, grade: "상", origin: "국내·수입", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"10kg\" = 10kg 일치" },
  { id: "cherry", name: "체리", category: "과일", auctionUnit: "5kg", weightKg: 5, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "국내·수입", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"5kg\" = 5kg 일치" },
  { id: "pineapple", name: "파인애플", category: "과일", auctionUnit: "12kg", weightKg: 12, consumerUnit: "1개", kgPerConsumerUnit: 1.5, grade: "상", origin: "국내·수입", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"12kg\" = 12kg 일치" },
  { id: "grape", name: "포도", category: "과일", auctionUnit: "3kg", weightKg: 3, consumerUnit: "1송이", kgPerConsumerUnit: 0.7, grade: "특", origin: "경북 김천", unitVerified: true, verificationNote: "KAMIS 도매 단위 \"3kg\" = 3kg 일치" },

  // ── 수산 ──────────────────────────────────────────────
  { id: "hairtail", name: "갈치", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1마리", kgPerConsumerUnit: 0.5, grade: "상", origin: "제주 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"1마리\"는 개수 기반 — 카탈로그 0.5kg/1마리로 환산" },
  { id: "mackerel", name: "고등어", category: "수산", auctionUnit: "10kg", weightKg: 10, consumerUnit: "1마리", kgPerConsumerUnit: 0.4, grade: "상", origin: "부산 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"1손\"는 개수 기반 — 카탈로그 0.4kg/1마리로 환산" },
  { id: "cockle", name: "꼬막", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"1kg\" 중량 기반 — 원/kg 환산 가능" },
  { id: "saury", name: "꽁치", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"5마리\"는 개수 기반 — 카탈로그 1kg/1kg로 환산" },
  { id: "blue-crab", name: "꽃게", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내 위판", aliases: { fishMarket: ["꽃게"] }, unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / 위판 표준코드명 후보 \"꽃게\" / KAMIS 소매 단위 \"1kg\" 중량 기반 — 원/kg 환산 가능" },
  { id: "octopus", name: "낙지", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "국내 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"100g\" 중량 기반 — 원/kg 환산 가능" },
  { id: "pollock", name: "명태", category: "수산", auctionUnit: "20kg", weightKg: 20, consumerUnit: "1마리", kgPerConsumerUnit: 0.6, grade: "상", origin: "속초 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"1kg\" 중량 기반 — 원/kg 환산 가능" },
  { id: "squid", name: "물오징어", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1마리", kgPerConsumerUnit: 0.27, grade: "상", origin: "동해 위판", aliases: { fishMarket: ["오징어", "살오징어"] }, unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / 위판 표준코드명 후보 \"오징어\", \"살오징어\" / KAMIS 소매 단위 \"1마리\"는 개수 기반 — 카탈로그 0.27kg/1마리로 환산" },
  { id: "clam", name: "바지락", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"1kg\" 중량 기반 — 원/kg 환산 가능" },
  { id: "spanish-mackerel", name: "삼치", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1마리", kgPerConsumerUnit: 0.4, grade: "상", origin: "국내 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"1마리\"는 개수 기반 — 카탈로그 0.4kg/1마리로 환산" },
  { id: "shrimp", name: "새우", category: "수산", auctionUnit: "2kg", weightKg: 2, consumerUnit: "100g", kgPerConsumerUnit: 0.1, grade: "상", origin: "충남 태안", aliases: { fishMarket: ["흰다리새우", "대하"] }, unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / 위판 표준코드명 후보 \"흰다리새우\", \"대하\" / KAMIS 소매 단위 \"10마리\"는 개수 기반 — 카탈로그 0.1kg/100g로 환산" },
  { id: "imported-croaker", name: "수입조기", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내 위판", unitVerified: false, verificationNote: "국내 산지 위판 원천 없음 (수입산) — 위판장 API로 커버되지 않는다" },
  { id: "abalone", name: "전복", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1마리", kgPerConsumerUnit: 0.08, grade: "상", origin: "국내 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"5마리\"는 개수 기반 — 카탈로그 0.08kg/1마리로 환산" },
  { id: "croaker", name: "조기", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내 위판", aliases: { fishMarket: ["참조기"] }, unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / 위판 표준코드명 후보 \"참조기\" / KAMIS 소매 단위 \"1마리\"는 개수 기반 — 카탈로그 1kg/1kg로 환산" },
  { id: "mussel", name: "홍합", category: "수산", auctionUnit: "1kg", weightKg: 1, consumerUnit: "1kg", kgPerConsumerUnit: 1, grade: "상", origin: "국내 위판", unitVerified: true, verificationNote: "해수부 위판장이 금액÷중량으로 원/kg를 직접 제공 — 거래단위 환산 불필요 / KAMIS 소매 단위 \"1kg\" 중량 기반 — 원/kg 환산 가능" },
];
