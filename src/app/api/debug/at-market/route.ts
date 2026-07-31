import { NextResponse } from "next/server";
import { CATALOG_ITEMS, itemLookupNames } from "@/lib/catalog";
import {
  fetchAtAuctionPerKg,
  GARAK_WHSAL_CD,
  probeAtMarket,
} from "@/lib/sources/atMarket";
import { todayKST } from "@/server/domain/date";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * aT 전국 공영도매시장 필드명·축 확정용 진단.
 *
 * 15141808의 응답 스키마는 명세서가 xlsx 첨부로만 제공되어 웹에서 확인할 수
 * 없었다. 어댑터는 문서로 확인된 후보 필드명들을 관대하게 수용하도록 만들었고,
 * 이 엔드포인트가 **실제로 어느 키가 맞았는지**를 알려준다.
 *
 * 확인 순서:
 *   1. matchedFields — price·unit이 null이면 후보 목록 보강 필요
 *   2. rawKeys — 우리가 안 보고 있는 키가 있는지
 *   3. rowsDropped — 크면 unit 매칭 실패이거나 개수 단위 비중이 큼
 *   4. catalogMatch — 품목명이 카탈로그와 붙는지
 *
 * 쿼리: ?date=YYYY-MM-DD, ?market=110001 (기본 가락)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayKST();
  const market = url.searchParams.get("market") ?? GARAK_WHSAL_CD;

  const probe = await probeAtMarket(date, market);
  const agg = await fetchAtAuctionPerKg(date, market, 2);

  const produce = CATALOG_ITEMS.filter((i) => i.category !== "수산");
  const names = new Set(agg ? [...agg.keys()] : []);

  const matched: string[] = [];
  const unmatched: { name: string; tried: string[] }[] = [];
  for (const item of produce) {
    const tried = itemLookupNames(item);
    const hit = tried.find((n) => names.has(n));
    if (hit) matched.push(hit === item.name ? item.name : `${item.name}→${hit}`);
    else unmatched.push({ name: item.name, tried });
  }

  const catalogNames = new Set(produce.flatMap(itemLookupNames));
  const unknownItems = agg
    ? [...agg.values()]
        .filter((a) => !catalogNames.has(a.itemName))
        .slice(0, 40)
        .map((a) => ({ name: a.itemName, perKg: a.perKg }))
    : [];

  return NextResponse.json({
    date,
    market,
    ...probe,
    fieldChecklist: {
      priceFieldFound: probe.matchedFields.price ?? null,
      unitFieldFound: probe.matchedFields.unit ?? null,
      qtyFieldFound: probe.matchedFields.qty ?? null,
      dropRate:
        probe.rowsFetched > 0
          ? Math.round((probe.rowsDropped / probe.rowsFetched) * 100) / 100
          : null,
      note: "price·unit이 잡히고 dropRate가 낮으면 AT_FIELD_CANDIDATES를 실제 키로 좁힐 것",
    },
    catalogMatch: {
      matchedCount: matched.length,
      matched,
      unmatched,
      unknownItems,
    },
  });
}
