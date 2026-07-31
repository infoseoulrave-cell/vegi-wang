import { NextResponse } from "next/server";
import {
  KAMIS_ALL_CATEGORIES,
  KAMIS_CATEGORY_CODE,
  listKamisCatalogItems,
  listKamisItemsByCode,
} from "@/lib/sources/kamis";
import { isProcessedSourceName } from "@/lib/catalog-focus";
import { CATALOG_ITEMS, itemLookupNames } from "@/lib/catalog";
import type { ProduceCategory } from "@/lib/types";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATS: ProduceCategory[] = ["채소", "과일", "수산"];

/**
 * KAMIS에서 실제로 내려오는 품목명·단위 목록 (카탈로그 확장용).
 * 시크릿은 노출하지 않는다.
 */
export async function GET(req: Request) {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  /*
   * ?codes=100,300 → ProduceCategory에 없는 부류를 실제 응답으로 탐색한다.
   * 카탈로그 확장 후보(감자·고구마·버섯 등)를 추측 없이 확인하기 위한 경로.
   */
  const codesParam = new URL(req.url).searchParams.get("codes");
  if (codesParam) {
    const codes = codesParam.split(",").map((c) => c.trim()).filter(Boolean);
    const rows = await listKamisItemsByCode(codes, today);
    const known = new Set(CATALOG_ITEMS.flatMap(itemLookupNames));
    return NextResponse.json({
      ok: Boolean(rows),
      date: today,
      codes,
      categoryGuide: KAMIS_ALL_CATEGORIES.filter((c) => codes.includes(c.code)),
      count: rows?.length ?? 0,
      // 도매·소매가 모두 있고, 가공식품이 아니며, 아직 카탈로그에 없는 품목
      candidates: (rows ?? []).filter(
        (r) =>
          r.hasWholesale &&
          r.hasRetail &&
          !isProcessedSourceName(r.name) &&
          !known.has(r.name),
      ),
      items: rows ?? [],
    });
  }

  const items = await listKamisCatalogItems(CATS, today);
  if (!items) {
    return NextResponse.json(
      { ok: false, error: "kamis_unavailable", date: today },
      { status: 503 },
    );
  }

  items.sort(
    (a, b) =>
      a.category.localeCompare(b.category, "ko") ||
      a.name.localeCompare(b.name, "ko"),
  );

  const byCategory = Object.fromEntries(
    CATS.map((cat) => [cat, items.filter((i) => i.category === cat)]),
  ) as Record<ProduceCategory, typeof items>;

  return NextResponse.json({
    ok: true,
    date: today,
    categoryCodes: KAMIS_CATEGORY_CODE,
    allCategories: KAMIS_ALL_CATEGORIES,
    count: items.length,
    counts: {
      채소: byCategory.채소.length,
      과일: byCategory.과일.length,
      수산: byCategory.수산.length,
    },
    byCategory,
    items,
  });
}
