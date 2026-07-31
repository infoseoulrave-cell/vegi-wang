import { NextResponse } from "next/server";
import {
  itemQueryName,
  kgPerConsumerUnitByName,
  lookupBySourceName,
  servableCatalog,
  sourceMarketFor,
} from "@/lib/catalog";
import { fetchAtAuctionPerKg, GARAK_WHSAL_CD } from "@/lib/sources/atMarket";
import { fetchFishMarketPerKg } from "@/lib/sources/fishMarket";
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

  const [kamis, fish, at] = await Promise.all([
    fetchKamisPrices(["채소", "과일", "수산"], date, kgPerConsumerUnitByName),
    fetchFishMarketPerKg(date),
    fetchAtAuctionPerKg(date, GARAK_WHSAL_CD),
  ]);

  const rows = [];
  for (const item of targets) {
    const market = sourceMarketFor(item);
    // 수산 경락가는 가락이 아니라 해수부 위판장(금액÷중량)에서 온다
    const fishHit = market === "fish_market" ? lookupBySourceName(fish, item) : undefined;
    const garakPerKg =
      market === "garak"
        ? await fetchGarakAuctionPerKg(itemQueryName(item), date)
        : null;

    const atHit = market === "garak" ? lookupBySourceName(at, item) : undefined;
    const k = kamis?.get(item.name) ?? kamis?.get(itemQueryName(item));
    const kamisSeriesToday =
      k?.seriesPerKg?.filter((p) => p.date === date).at(-1)?.price ?? null;
    const resolution =
      market === "fish_market"
        ? {
            perKg: fishHit && !fishHit.rejected ? fishHit.perKg : null,
            rejected: fishHit?.rejected ?? null,
          }
        : resolveAuctionPerKg(garakPerKg, kamisSeriesToday, atHit?.perKg ?? null);

    const ratio =
      garakPerKg && kamisSeriesToday
        ? Math.round((garakPerKg / kamisSeriesToday) * 100) / 100
        : null;

    rows.push({
      name: item.name,
      category: item.category,
      sourceMarket: market,
      auctionUnit: item.auctionUnit,
      weightKg: item.weightKg,
      atPerKg: atHit?.perKg ?? null,
      atDroppedRows: atHit?.droppedRows ?? null,
      garakPerKg,
      fishMarketPerKg: fishHit?.perKg ?? null,
      fishMarketCount: fishHit?.marketCount ?? null,
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
