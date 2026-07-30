import { NextResponse } from "next/server";
import {
  KAMIS_CATEGORY_CODE,
  listKamisCatalogItems,
} from "@/lib/sources/kamis";
import type { ProduceCategory } from "@/lib/types";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATS: ProduceCategory[] = ["채소", "과일", "수산"];

/**
 * KAMIS에서 실제로 내려오는 품목명·단위 목록 (카탈로그 확장용).
 * 시크릿은 노출하지 않는다.
 */
export async function GET() {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

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
