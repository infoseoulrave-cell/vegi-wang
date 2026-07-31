import { NextResponse } from "next/server";
import { CATALOG_ITEMS, itemLookupNames } from "@/lib/catalog";
import { probeFishMarket } from "@/lib/sources/fishMarket";
import { todayKST } from "@/server/domain/date";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 해수부 위판장 축 확정용 진단.
 *
 * DATA_GO_KR_SERVICE_KEY 발급 전에는 어댑터의 축 가정을 라이브로 확인할 수
 * 없었다. 키가 붙는 순간 이 엔드포인트로 세 가지를 확정한다.
 *
 *   1. csmtWt가 kg인가          → sample[].derivedPerKg가 상식 범위인가
 *   2. csmtUntpc가 원/kg인가     → unitPriceRatioMedian ≈ 1인가
 *   3. 품목명이 매칭되는가        → unmatchedSpecies / matchedItems
 *
 * 쿼리: ?date=YYYY-MM-DD (기본 오늘)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayKST();

  const probe = await probeFishMarket(date);

  // 카탈로그 수산 품목이 위판 표준코드명과 붙는지
  const seafood = CATALOG_ITEMS.filter((i) => i.category === "수산");
  const speciesNames = new Set(probe.species.map((s) => s.itemName));

  const matched: string[] = [];
  const unmatched: { name: string; tried: string[] }[] = [];
  for (const item of seafood) {
    const names = itemLookupNames(item);
    const hit = names.find((n) => speciesNames.has(n));
    if (hit) matched.push(hit === item.name ? item.name : `${item.name}→${hit}`);
    else unmatched.push({ name: item.name, tried: names });
  }

  // 카탈로그가 아직 모르는 어종 — 별칭 후보를 여기서 찾는다
  const catalogNames = new Set(seafood.flatMap(itemLookupNames));
  const unknownSpecies = probe.species
    .filter((s) => !catalogNames.has(s.itemName))
    .map((s) => ({ name: s.itemName, perKg: s.perKg }));

  return NextResponse.json({
    date,
    ...probe,
    axisChecklist: {
      weightUnitLooksLikeKg:
        probe.speciesResolved > 0 && probe.speciesRejected === 0,
      unitPriceIsPerKg:
        probe.unitPriceRatioMedian == null
          ? null
          : Math.abs(probe.unitPriceRatioMedian - 1) < 0.2,
      note: "셋 다 확인되면 fishMarket.ts의 '미검증' 주석을 지울 것",
    },
    catalogMatch: {
      matched,
      unmatched,
      unknownSpecies: unknownSpecies.slice(0, 40),
    },
  });
}
