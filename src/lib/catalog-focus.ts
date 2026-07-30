import type { PriceItemWithSignal } from "./types";

/**
 * 가공·건조·조미 식품 — 시세 보드/추천에서 제외.
 * (고춧가루, 천일염, 젓갈, 마른 수산물 등)
 */
export const PROCESSED_ITEM_IDS = new Set([
  "chili-powder", // 고춧가루
  "sea-salt", // 천일염
  "dried-chili", // 건고추
  "mackerel-fillet", // 고등어필렛
  "kelp", // 건다시마
  "laver", // 김
  "anchovy", // 마른멸치
  "seaweed", // 마른미역
  "dried-squid", // 마른오징어
  "dried-pollock", // 북어
  "anchovy-sauce", // 멸치액젓
  "shrimp-sauce", // 새우젓
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
]);

export function isProcessedItem(id: string): boolean {
  return PROCESSED_ITEM_IDS.has(id);
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
