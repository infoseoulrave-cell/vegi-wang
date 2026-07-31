import type { PriceItemWithSignal } from "./types";

/**
 * 가공·건조·조미 식품 — 시세 보드/추천에서 제외.
 *
 * 해당 품목들은 카탈로그에서 이미 제거되어 이 목록은 현재 비어 있다.
 * KAMIS는 고춧가루·천일염·젓갈·마른 수산물을 계속 내려주므로,
 * 카탈로그를 확장할 때 다시 들어오지 않도록 방어선으로 남긴다.
 * (KAMIS 실제 품목명: 건고추 고춧가루 건다시마 고등어필렛 김 마른멸치
 *  마른미역 마른오징어 멸치액젓 북어 새우젓 천일염)
 */
export const PROCESSED_ITEM_IDS = new Set<string>([]);

/** 카탈로그에 추가하면 안 되는 KAMIS 품목명 — 가공·건조·조미 */
export const PROCESSED_SOURCE_NAMES = new Set([
  "건고추",
  "고춧가루",
  "건다시마",
  "고등어필렛",
  "김",
  "마른멸치",
  "마른미역",
  "마른오징어",
  "멸치액젓",
  "북어",
  "새우젓",
  "천일염",
]);

/**
 * 사람들이 장바구니에 자주 넣는 생식품 중심.
 * 구매 추천 / 관망 / 절약 바구니 후보.
 */
export const EVERYDAY_ITEM_IDS = new Set([
  // 채소
  "cabbage",
  "radish",
  "onion",
  "green-onion",
  "carrot",
  "cucumber",
  "zucchini",
  "spinach",
  "lettuce",
  "tomato",
  "cherry-tomato",
  "chili",
  "garlic",
  "cabbage-wrap",
  "broccoli",
  "paprika",
  "perilla-leaf",
  "watermelon",
  "korean-melon",
  "melon",
  // 장바구니에 흔히 들어가는데 후보에서 빠져 있던 품목
  "ginger", // 생강
  "minari", // 미나리
  "wrap-cabbage", // 알배기배추
  "young-cabbage", // 얼갈이배추
  "yeolmu", // 열무
  "bell-pepper", // 피망
  "red-chili", // 붉은고추
  "garlic-bulb", // 피마늘
  // 과일
  "apple",
  "pear",
  "banana",
  "grape",
  "tangerine",
  "peach",
  "orange",
  "pineapple",
  "mango",
  "kiwi",
  "lemon", // 레몬
  // 수산 (신선)
  "mackerel",
  "squid",
  "shrimp",
  "hairtail",
  "pollock",
  "spanish-mackerel",
  "clam",
  "mussel",
  "blue-crab",
  "saury",
  "croaker",
  "octopus",
  "abalone", // 전복
  "cockle", // 꼬막
]);

export function isProcessedItem(id: string): boolean {
  return PROCESSED_ITEM_IDS.has(id);
}

/**
 * 소스 품목명이 가공·건조·조미 식품인가.
 * 카탈로그를 확장할 때 이 이름들이 다시 들어오지 않도록 막는 방어선이다.
 */
export function isProcessedSourceName(name: string): boolean {
  return PROCESSED_SOURCE_NAMES.has(name.trim());
}

export function isEverydayItem(id: string): boolean {
  return EVERYDAY_ITEM_IDS.has(id);
}

/** 추천·절약 메뉴용 — 일상 생식품만 */
export function everydayItems(
  items: PriceItemWithSignal[],
): PriceItemWithSignal[] {
  return items.filter((i) => isEverydayItem(i.id) && !isProcessedItem(i.id));
}
