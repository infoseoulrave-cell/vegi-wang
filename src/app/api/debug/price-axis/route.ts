import { NextResponse } from "next/server";
import {
  itemQueryName,
  kgPerConsumerUnitByName,
  servableCatalog,
} from "@/lib/catalog";
import { fetchGarakAuctionPerKg } from "@/lib/sources/garak";
import { fetchKamisPrices } from "@/lib/sources/kamis";
import { resolveAuctionPerKg } from "@/lib/prices";
import { todayKST } from "@/server/domain/date";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 가격 축 상시 진단 — 품목별로 두 소스의 원/kg 값을 나란히 보여준다.
 *
 * 2026-07-31에 무 36원/kg·거품배수 64배 같은 값이 프로덕션에 나가고 있었는데,
 * 그걸 알아채는 데 필요한 건 화면이 아니라 이 표였다.
 * 축이 다시 어긋나면 여기서 먼저 보이도록 상시 유지한다.
 *
 * 쿼리: ?date=YYYY-MM-DD (기본 오늘), ?limit=N (기본 전량)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayKST();
  const limitParam = Number(url.searchParams.get("limit") ?? 0);

  const catalog = servableCatalog();
  const targets = limitParam > 0 ? catalog.slice(0, limitParam) : catalog;

  const kamis = await fetchKamisPrices(
    ["채소", "과일", "수산"],
    date,
    kgPerConsumerUnitByName,
  );

  const rows = [];
  for (const item of targets) {
    const garakPerKg =
      item.category === "수산"
        ? null // 가락 청과 법인만 조회 가능 — 수산은 경락가 원천이 없다
        : await fetchGarakAuctionPerKg(itemQueryName(item), date);

    const k = kamis?.get(item.name) ?? kamis?.get(itemQueryName(item));
    const kamisSeriesToday =
      k?.seriesPerKg?.filter((p) => p.date === date).at(-1)?.price ?? null;
    const resolution = resolveAuctionPerKg(garakPerKg, kamisSeriesToday);

    const ratio =
      garakPerKg && kamisSeriesToday
        ? Math.round((garakPerKg / kamisSeriesToday) * 100) / 100
        : null;

    rows.push({
      name: item.name,
      category: item.category,
      auctionUnit: item.auctionUnit,
      weightKg: item.weightKg,
      garakPerKg,
      kamisTodayPerKg: kamisSeriesToday,
      kamisBaselinePerKg: k?.baselinePerKg ?? null,
      kamisWholesaleUnit: k?.wholesaleUnit ?? null,
      retailPerKg: k?.retailPerKg ?? null,
      retailUnit: k?.retailUnit ?? null,
      garakVsKamisRatio: ratio,
      resolvedPerKg: resolution.perKg,
      rejected: resolution.rejected,
      // 최종 소비자 노출값 — 상식 범위를 눈으로 확인하기 위한 파생값
      unitPrice:
        resolution.perKg != null
          ? Math.round(resolution.perKg * item.weightKg)
          : null,
      retailMultiple:
        resolution.perKg && k?.retailPerKg
          ? Math.round((k.retailPerKg / resolution.perKg) * 100) / 100
          : null,
    });
  }

  const withMultiple = rows.filter((r) => r.retailMultiple != null);
  const multiples = withMultiple
    .map((r) => r.retailMultiple as number)
    .sort((a, b) => a - b);

  return NextResponse.json({
    date,
    itemsChecked: rows.length,
    summary: {
      resolved: rows.filter((r) => r.resolvedPerKg != null).length,
      rejected: rows.filter((r) => r.rejected).length,
      missing: rows.filter((r) => r.resolvedPerKg == null && !r.rejected).length,
      // 축이 정상이면 대부분 1.2~6배 사이에 들어와야 한다
      retailMultiple: multiples.length
        ? {
            min: multiples[0],
            median: multiples[Math.floor(multiples.length / 2)],
            max: multiples[multiples.length - 1],
            outOfBand: withMultiple
              .filter(
                (r) =>
                  (r.retailMultiple as number) < 1 ||
                  (r.retailMultiple as number) > 8,
              )
              .map((r) => `${r.name}:${r.retailMultiple}`),
          }
        : null,
    },
    rows,
  });
}
