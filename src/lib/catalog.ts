import type { PriceItem } from "./types";

/** 조회용 대표 품목명 (가락 s_pummok / KAMIS 매칭) */
export function itemQueryName(item: Pick<PriceItem, "name" | "queryName">): string {
  if (item.queryName?.trim()) return item.queryName.trim();
  return item.name.replace(/\(.*?\)/g, "").trim();
}
