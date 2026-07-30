import { CATALOG_ITEMS } from "./catalog-items";
import type { CatalogItem } from "./types";

export { CATALOG_ITEMS };

/** 조회용 대표 품목명 (가락 s_pummok / KAMIS 매칭) */
export function itemQueryName(
  item: Pick<CatalogItem, "name" | "queryName">,
): string {
  if (item.queryName?.trim()) return item.queryName.trim();
  return item.name.replace(/\(.*?\)/g, "").trim();
}

/**
 * 서빙 대상 품목 — 환산중량이 실제 소스 응답과 대조 검증된 것만.
 *
 * 미검증 품목을 노출하면 환산 근거 없는 원/kg가 화면에 나간다.
 * 품목 수가 줄더라도 보이는 값은 전부 방어 가능해야 한다.
 * 검증 결과: docs/CATALOG_VERIFICATION.md
 */
export function servableCatalog(): CatalogItem[] {
  return CATALOG_ITEMS.filter((i) => i.unitVerified);
}

export function getCatalogItem(id: string): CatalogItem | null {
  return CATALOG_ITEMS.find((i) => i.id === id) ?? null;
}

/** 한 품목이 소스에서 불릴 수 있는 모든 이름 (정확 매칭 후보) */
export function itemLookupNames(item: CatalogItem): string[] {
  const names = [
    item.name,
    itemQueryName(item),
    ...(item.aliases?.kamis ?? []),
    ...(item.aliases?.garak ?? []),
  ];
  return [...new Set(names.filter(Boolean))];
}

/**
 * 소스 응답 맵에서 품목을 찾는다.
 *
 * **정확 일치와 명시적 별칭만** 인정한다. 예전 pickByName은
 * `k.includes(base) || base.includes(k)` 양방향 부분문자열 매칭이라
 * "배"가 "배추"·"양배추"·"알배기배추"에 걸렸고, Map 순회 순서에 따라
 * 결과가 달라졌다. 못 찾으면 추측하지 않고 undefined를 반환한다.
 */
export function lookupBySourceName<T>(
  map: Map<string, T> | null | undefined,
  item: CatalogItem,
): T | undefined {
  if (!map) return undefined;
  for (const name of itemLookupNames(item)) {
    const hit = map.get(name);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * 개수 기반 단위 1개의 검증된 중량(kg)을 품목명으로 조회한다.
 * KAMIS 어댑터가 "1포기"/"10개" 같은 단위를 원/kg로 환산할 때 쓰는 유일한 근거.
 * 검증되지 않은 품목은 null — 어댑터가 추정하지 않고 값을 버린다.
 */
export function kgPerConsumerUnitByName(sourceName: string): number | null {
  for (const item of CATALOG_ITEMS) {
    if (!item.unitVerified) continue;
    if (itemLookupNames(item).includes(sourceName)) {
      return item.kgPerConsumerUnit > 0 ? item.kgPerConsumerUnit : null;
    }
  }
  return null;
}
