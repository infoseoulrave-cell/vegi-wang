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

/**
 * 서빙 대상 중 KAMIS 기본 부류 밖에서 조회해야 하는 부류코드들.
 * 감자·고구마(100), 버섯류(300)처럼 화면 분류(채소)와 KAMIS 부류가 다른 품목용.
 */
export function extraKamisCategoryCodes(): string[] {
  return [
    ...new Set(
      servableCatalog()
        .map((i) => i.kamisCategoryCode)
        .filter((c): c is string => Boolean(c)),
    ),
  ];
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
    ...(item.aliases?.fishMarket ?? []),
  ];
  return [...new Set(names.filter(Boolean))];
}

/**
 * 경락가 원천이 어느 시장인가.
 *
 * 가락은 청과 6개 법인만 조회하므로 수산 경락가가 없다. 수산은 해수부
 * 위판장(산지 위탁판매)이 원천이고, 금액÷중량으로 원/kg가 바로 나온다.
 */
export function sourceMarketFor(item: CatalogItem): "garak" | "fish_market" {
  return item.category === "수산" ? "fish_market" : "garak";
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
 * 한 품목이 **특정 소스에서** 불릴 수 있는 이름들.
 *
 * itemLookupNames는 모든 소스의 별칭을 합치므로 집계에 쓰면 안 된다.
 * 대파의 KAMIS 별칭 "파"가 가락 원천의 "파"(쪽파·실파 등)를 끌어와
 * 다른 품목의 경락가가 대파로 집계된다.
 */
export function sourceLookupNames(
  item: CatalogItem,
  source: "garak" | "kamis" | "fishMarket",
): string[] {
  const names = [
    item.name,
    itemQueryName(item),
    ...(item.aliases?.[source] ?? []),
  ];
  return [...new Set(names.filter(Boolean))];
}

/**
 * 가락에 던질 조회어 목록 (중복 제거).
 *
 * 가락 표기가 카탈로그와 다른 품목이 있다 — 멜론은 "메론", 피마늘은 "마늘"로
 * 등록돼 있어 카탈로그 이름 그대로 질의하면 부분매칭이 0건이 되고
 * 그 품목은 통째로 수집되지 않는다. 별칭까지 함께 던진다.
 */
export function garakQueryNames(): string[] {
  const names = new Set<string>();
  for (const item of CATALOG_ITEMS) {
    if (sourceMarketFor(item) !== "garak") continue;
    names.add(itemQueryName(item));
    for (const alias of item.aliases?.garak ?? []) names.add(alias);
  }
  return [...names];
}

/**
 * 원천 응답의 품목명 → 카탈로그 id 매핑 (소스별).
 *
 * **정확한 품목명을 먼저 전부 등록한 뒤** 조회어·별칭을 채운다.
 * 순서가 중요하다 — "참다래(수입)"은 괄호를 벗기면 "참다래"가 되므로,
 * 별칭을 먼저 등록하면 수입 품목이 국산 id를 차지해 둘 중 하나가 사라진다.
 */
export function itemIdBySourceName(
  source: "garak" | "fishMarket",
): Map<string, string> {
  const map = new Map<string, string>();
  const scoped = CATALOG_ITEMS.filter(
    (i) => (sourceMarketFor(i) === "fish_market" ? "fishMarket" : "garak") === source,
  );
  for (const item of scoped) map.set(item.name, item.id);
  for (const item of scoped) {
    for (const name of sourceLookupNames(item, source)) {
      if (!map.has(name)) map.set(name, item.id);
    }
  }
  return map;
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
