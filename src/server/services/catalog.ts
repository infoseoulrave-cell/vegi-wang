import { CATALOG_ITEMS, sourceMarketFor } from "@/lib/catalog";
import type { ItemMaster, Market } from "@/server/domain/models";
import type { Repositories } from "@/server/repos/types";

export const GARAK_MARKET: Market = {
  code: "110001",
  name: "서울 가락동 농수산물도매시장",
  region: "서울",
  isActive: true,
};

/**
 * 해수부 위판장 집계 원천.
 * 표준 도매시장코드 체계에 속하지 않으므로 900001을 부여했다.
 * 개별 위판장명은 raw_auction.corp_name에 남는다.
 */
export const FISH_MARKET: Market = {
  code: "900001",
  name: "전국 수협 위판장",
  region: "전국",
  isActive: true,
};

/**
 * 프론트 카탈로그를 DB 품목 마스터로 변환한다.
 *
 * 미검증 품목도 DB에는 적재한다 — 이력을 쌓아 두면 나중에 환산 근거가
 * 확보됐을 때 재집계할 수 있다. 다만 `isActive`는 검증 여부를 따르므로
 * 서빙에는 나가지 않는다.
 */
export function catalogFromSource(): ItemMaster[] {
  return CATALOG_ITEMS.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    auctionUnit: i.auctionUnit,
    weightKg: i.weightKg,
    defaultGrade: i.grade,
    defaultOrigin: i.origin,
    isActive: i.unitVerified,
    unitVerified: i.unitVerified,
    sourceMarket: sourceMarketFor(i),
  }));
}

/** 시장·품목 마스터 시드 (멱등) */
export async function seedCatalog(repos: Repositories): Promise<{
  markets: number;
  items: number;
}> {
  await repos.catalog.ensureMarket(GARAK_MARKET);
  await repos.catalog.ensureMarket(FISH_MARKET);
  const items = catalogFromSource();
  const n = await repos.catalog.upsertItems(items);
  return { markets: 2, items: n };
}
