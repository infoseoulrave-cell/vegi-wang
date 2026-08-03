import {
  extraKamisCategoryCodes,
  kgPerConsumerUnitByName,
  lookupBySourceName,
  servableCatalog,
  sourceMarketFor,
} from "@/lib/catalog";
import { withSignal } from "@/lib/compass";
import {
  buildMarketLabel,
  CARRY_FORWARD_DAYS,
  getPriceFeed as getLivePriceFeed,
  resolveWithCarryForward,
} from "@/lib/prices";
import { fetchKamisPrices } from "@/lib/sources/kamis";
import { normalizeSeries } from "@/lib/trend";
import type {
  BaselineMethod,
  PriceFeed,
  PriceItem,
  PricePoint,
} from "@/lib/types";
import { getEnv } from "@/server/config/env";
import { addDaysISO, todayKST } from "@/server/domain/date";
import type { DailyItemPrice } from "@/server/domain/models";
import type { Repositories } from "@/server/repos/types";
import { FISH_MARKET, seedCatalog } from "@/server/services/catalog";
import { representativePerKg } from "@/server/services/aggregate";

/**
 * DB에 최근 daily_item_price가 있으면 DB로 피드를 구성한다.
 * 없으면 실시간 어댑터(getLivePriceFeed)로 폴백.
 *
 * DB 경로가 실시간 경로보다 나은 이유는 자체 이력이 쌓인다는 점이다 —
 * item_baseline이 우리 경락가로 산출되면 KAMIS 평년가 의존을 끊을 수 있다.
 */
export async function getServedPriceFeed(
  repos: Repositories,
  dateISO?: string,
): Promise<PriceFeed & { storage: "db" | "live" }> {
  const saleDate = dateISO ?? todayKST();
  const marketCode = getEnv().defaultMarketCode;
  const windowDays = getEnv().baselineWindowDays;

  /*
   * DB가 붙지 않으면 실시간 경로로 물러난다.
   *
   * 예전에는 seedCatalog가 던지면 그대로 위로 전파돼 페이지 프리렌더가
   * 통째로 실패했다. DATABASE_URL이 설정돼 있는데 값이 틀리면(비밀번호 오타,
   * 네트워크 차단) **배포 전체가 깨진다.** DB는 이력을 쌓는 수단이지
   * 서비스 가용성의 전제가 아니므로, 실패하면 조용히 실시간 경로를 쓴다.
   */
  let daily: DailyItemPrice[];
  try {
    await seedCatalog(repos);

    // 청과(가락)와 수산(위판장)은 시장 코드가 다르다 — 둘 다 읽는다.
    const [garakDaily, fishDaily] = await Promise.all([
      repos.auction.getDaily(marketCode, saleDate),
      repos.auction.getDaily(FISH_MARKET.code, saleDate),
    ]);
    daily = [...garakDaily, ...fishDaily];
  } catch (err) {
    console.error(
      "[price-feed] DB 접근 실패 — 실시간 경로로 폴백",
      err instanceof Error ? err.message : err,
    );
    const live = await getLivePriceFeed(saleDate);
    return { ...live, storage: "live" };
  }

  /*
   * 오늘 경락이 없어도(주말·휴장·수집 실패) 여기서 물러나지 않는다.
   *
   * 예전에는 daily가 비면 곧장 실시간 경로로 돌아갔다. 그런데 아래 루프의
   * resolveWithCarryForward가 존재하는 이유가 바로 "오늘 값이 없으면 직전
   * 영업일 값을 날짜 라벨과 함께 쓴다"이다. 그 로직에 닿기도 전에 빠져나가면,
   * 토요일마다 자체 이력·자체 기준선이 화면에서 사라지고 KAMIS 앵커 4점
   * (1년전·1개월전·1주일전·오늘)만 남는다. 매일 쌓는 이력이 무의미해진다.
   *
   * 실측(2026-08-01 토): trendSource·baselineMethod·차트 171점이 전부 kamis였다.
   *
   * 이월할 이력조차 없으면 루프가 아무것도 만들지 못하므로, 그때만 물러난다.
   */


  const [garakBaselines, fishBaselines] = await Promise.all([
    repos.auction.listBaselines(marketCode, saleDate, windowDays),
    repos.auction.listBaselines(FISH_MARKET.code, saleDate, windowDays),
  ]);
  const baselineByItemId = new Map(
    [...garakBaselines, ...fishBaselines].map((b) => [b.itemId, b]),
  );

  const kamis = await fetchKamisPrices(
    ["채소", "과일", "수산"],
    saleDate,
    kgPerConsumerUnitByName,
    extraKamisCategoryCodes(),
  );

  const catalog = servableCatalog();
  const dailyByItemId = new Map<string, DailyItemPrice>();
  for (const d of daily) if (d.itemId) dailyByItemId.set(d.itemId, d);

  const fromDate = addDaysISO(saleDate, -(windowDays - 1));
  let retailLive = false;
  const built: PriceItem[] = [];

  for (const base of catalog) {
    const k = lookupBySourceName(kamis, base);
    const sourceMarket = sourceMarketFor(base);
    const itemMarketCode =
      sourceMarket === "fish_market" ? FISH_MARKET.code : marketCode;
    if (k?.retailPerKg) retailLive = true;

    // 자체 이력 우선. 청과만 KAMIS 시리즈로 부트스트랩한다 —
    // 수산의 KAMIS 도매는 도매시장 가격이라 산지 위판가와 유통 단계가 다르다.
    let history: PricePoint[] = [];
    try {
      const dbHist = await repos.auction.getDailyByItem(
        itemMarketCode,
        base.name,
        fromDate,
        saleDate,
      );
      // DB 이력은 전부 우리 수집분이라 같은 원천이다 — 비교에 안전하다
      history = dbHist.map((h) => ({
        date: h.saleDate,
        price: representativePerKg(h),
        source: "db" as const,
      }));
    } catch {
      // memory 리포지 등 — 아래 폴백으로
    }
    /*
     * 예전에는 DB 이력이 부족하면 KAMIS 시계열을 이어 붙였다. 그러면 오늘값
     * (우리 수집분)과 어제값(KAMIS)의 원천이 달라 등락률이 원천 차이를 찍는다.
     * DB 이력이 없으면 그냥 비운다 — 며칠만 지나면 자체 이력으로 채워진다.
     */
    history = normalizeSeries(history);

    const todayRow = dailyByItemId.get(base.id);
    const resolved = resolveWithCarryForward(
      todayRow ? representativePerKg(todayRow) : null,
      history,
      saleDate,
    );
    if (!resolved) continue; // 실측도 이월 대상도 없음 → 비노출

    /*
     * 기준선도 같은 원천이어야 한다. DB 경로의 오늘값은 우리 수집분이므로
     * KAMIS 평년가를 기준선으로 쓰면 원천 차이만큼 상수 편차가 얹힌다.
     * 자체 기준선(item_baseline)이 없으면 기준선 없음으로 둔다.
     */
    const own = baselineByItemId.get(base.id);
    const baselinePerKg = own?.avgPricePerKg ?? 0;
    const baselineMethod: BaselineMethod = own ? own.method : "none";

    const prev = history
      .filter((p) => p.date < saleDate && p.price > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    built.push({
      ...base,
      auctionPerKg: resolved.perKg,
      /*
       * 범위는 **당일 실측 행에서만** 나온다. 이월값에 오늘 범위를 붙이면
       * 어제 평균에 그제 최저·최고를 섞는 꼴이라, 이월이면 비운다.
       */
      auctionLowPerKg:
        resolved.status === "carried" ? undefined : todayRow?.minPricePerKg,
      auctionHighPerKg:
        resolved.status === "carried" ? undefined : todayRow?.maxPricePerKg,
      // 이월이면 등락률을 만들지 않는다 (위 prices.ts와 동일 규칙)
      auctionPrevPerKg: resolved.status === "carried" ? undefined : prev?.price,
      auctionBaselinePerKg: baselinePerKg,
      baselineMethod,
      retailPerKg: k?.retailPerKg,
      sourceMarket,
      priceSource: "db",
      priceStatus: resolved.status,
      asOfDate: resolved.asOfDate,
      auctionUnit: todayRow?.unit || base.auctionUnit,
      grade: todayRow?.grade || base.grade,
      origin: todayRow?.origin || base.origin,
      history: normalizeSeries([
        ...history,
        { date: saleDate, price: resolved.perKg, label: "오늘", source: "db" },
      ]),
    });
  }

  // 이월할 이력조차 없다 — 그때만 실시간으로 물러난다
  if (!built.length) {
    const live = await getLivePriceFeed(saleDate);
    return { ...live, storage: "live" };
  }

  return {
    date: saleDate,
    market: buildMarketLabel(built),
    auctionSource: built.some((i) => i.priceStatus === "live")
      ? "live"
      : built.length
        ? "carried"
        : "none",
    retailSource: retailLive ? "live" : "none",
    items: built.map(withSignal),
    storage: "db",
  };
}

export { CARRY_FORWARD_DAYS };
