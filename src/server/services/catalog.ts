import { SAMPLE_ITEMS } from "@/lib/sample-data";
import type { CatalogItem, Market } from "@/server/domain/models";
import type { Repositories } from "@/server/repos/types";

export const GARAK_MARKET: Market = {
  code: "110001",
  name: "서울 가락동 농수산물도매시장",
  region: "서울",
  isActive: true,
};

export function catalogFromSample(): CatalogItem[] {
  return SAMPLE_ITEMS.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    auctionUnit: i.auctionUnit,
    weightKg: i.weightKg,
    defaultGrade: i.grade,
    defaultOrigin: i.origin,
    isActive: true,
  }));
}

/** 시장·품목 마스터 시드 (멱등) */
export async function seedCatalog(repos: Repositories): Promise<{
  markets: number;
  items: number;
}> {
  await repos.catalog.ensureMarket(GARAK_MARKET);
  const items = catalogFromSample();
  const n = await repos.catalog.upsertItems(items);
  return { markets: 1, items: n };
}
