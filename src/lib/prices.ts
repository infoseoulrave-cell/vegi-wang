import {
  itemQueryName,
  extraKamisCategoryCodes,
  kgPerConsumerUnitByName,
  lookupBySourceName,
  servableCatalog,
  sourceMarketFor,
} from "./catalog";
import { withSignal } from "./compass";
import { fetchAtAuctionPerKg, GARAK_WHSAL_CD } from "./sources/atMarket";
import {
  fetchFishMarketPerKg,
  type FishSpeciesPrice,
} from "./sources/fishMarket";
import { fetchGarakAuctionPerKg } from "./sources/garak";
import { fetchKamisPrices, type KamisPrice } from "./sources/kamis";
import { normalizeSeries } from "./trend";
import {
  SOURCE_MARKET_LABEL,
  type CatalogItem,
  type PriceFeed,
  type PriceItem,
  type PricePoint,
  type PriceSource,
  type PriceSourceMarket,
} from "./types";

/** 실측값을 이월해서 보여줄 최대 일수 — 그 밖은 비노출 */
export const CARRY_FORWARD_DAYS = 7;

/**
 * 서로 다른 소스의 원/kg 값이 이 배수 이상 벌어지면 축이 어긋난 것으로 보고
 * **둘 다 버린다.** 낮은 쪽을 채택하는 예전 방식이 정확히 이중 나눗셈 버그를
 * 만들었다 (가락 상자가 vs KAMIS 원/kg는 weightKg 배 차이 → 항상 KAMIS 채택).
 */
export const AXIS_DIVERGENCE_LIMIT = 10;

/** 임의 시각을 KST 기준 YYYY-MM-DD로 변환 */
function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export interface AxisResolution {
  perKg: number | null;
  /** 거부 사유 (운영 진단용). null이면 정상 */
  rejected: string | null;
}

/**
 * 청과 경락가 원/kg를 확정한다.
 *
 * 우선순위: **aT → 가락 → KAMIS**.
 *   aT(15141808)는 전국 32개 도매시장을 한 번에 주고 거래량까지 있어
 *   물량 가중평균이 가능하다. 가락 개별 API보다 신뢰도가 높다.
 *   가락은 aT 결측 시 대체이자 교차검증 상대다.
 *   KAMIS 도매는 슬롯마다 축이 달라 주 원천이 될 수 없다 — 최후 폴백.
 *
 * 채택값과 **가장 크게 어긋난 다른 값**의 비율이 한계를 넘으면 전부 버린다.
 * 축이 어긋났다는 신호이지 어느 쪽을 고를 문제가 아니다.
 */
export function resolveAuctionPerKg(
  garakPerKg: number | null | undefined,
  kamisPerKg: number | null | undefined,
  atPerKg?: number | null,
): AxisResolution {
  const pos = (v: number | null | undefined) => (v != null && v > 0 ? v : null);
  const at = pos(atPerKg);
  const g = pos(garakPerKg);
  const k = pos(kamisPerKg);

  const chosen = at ?? g ?? k;
  if (chosen == null) return { perKg: null, rejected: null };

  const others: Array<[string, number]> = [];
  if (at != null && at !== chosen) others.push(["aT", at]);
  if (g != null && g !== chosen) others.push(["가락", g]);
  if (k != null && k !== chosen) others.push(["KAMIS", k]);

  for (const [label, v] of others) {
    const ratio = chosen > v ? chosen / v : v / chosen;
    if (ratio >= AXIS_DIVERGENCE_LIMIT) {
      return {
        perKg: null,
        rejected: `축 불일치 — 채택 ${chosen}원/kg vs ${label} ${v}원/kg (${ratio.toFixed(1)}배)`,
      };
    }
  }
  return { perKg: chosen, rejected: null };
}

/**
 * 피드에 실제로 포함된 원천만 라벨에 적는다.
 * 청과만 있으면 가락, 수산만 있으면 위판장, 섞이면 둘 다.
 */
export function buildMarketLabel(items: { sourceMarket: PriceSourceMarket }[]): string {
  const kinds = new Set(items.map((i) => i.sourceMarket));
  const labels = (["garak", "fish_market"] as const)
    .filter((k) => kinds.has(k))
    .map((k) => SOURCE_MARKET_LABEL[k]);
  return labels.length ? labels.join(" · ") : SOURCE_MARKET_LABEL.garak;
}

/** 품목 밴드를 벗어나면 거부 */
function checkPlausible(item: CatalogItem, perKg: number): string | null {
  const band = item.plausiblePerKg;
  if (!band) return null;
  if (perKg < band.min || perKg > band.max) {
    return `상식 범위 밖 — ${perKg}원/kg (허용 ${band.min}~${band.max})`;
  }
  return null;
}

interface Resolved {
  perKg: number;
  status: "live" | "carried";
  asOfDate?: string;
}

/**
 * 오늘 값이 없으면 시계열에서 최근 실측값을 이월한다.
 * CARRY_FORWARD_DAYS를 넘으면 null — 오래된 값을 오늘 시세인 척 보여주지 않는다.
 */
export function resolveWithCarryForward(
  todayPerKg: number | null,
  series: PricePoint[],
  todayISO: string,
): Resolved | null {
  if (todayPerKg != null && todayPerKg > 0) {
    return { perKg: todayPerKg, status: "live" };
  }
  const older = series
    .filter((p) => p.date <= todayISO && p.price > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = older[0];
  if (!latest) return null;
  if (daysBetween(latest.date, todayISO) > CARRY_FORWARD_DAYS) return null;
  return { perKg: latest.price, status: "carried", asOfDate: latest.date };
}

/**
 * 직전 영업일 값. **없으면 undefined** — 오늘 값으로 대체하지 않는다.
 * 예전에는 fallback으로 오늘 값을 넣어 등락률 0%를 만들었는데,
 * "변동 없음"과 "전일 데이터 없음"은 다른 사실이다.
 */
function prevFromSeries(
  series: PricePoint[],
  todayISO: string,
): number | undefined {
  const older = series
    .filter((p) => p.date < todayISO && p.price > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  return older[0]?.price;
}

async function fetchGarakPerKgMap(
  items: CatalogItem[],
  dateISO: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const batchSize = 8; // 타임아웃·레이트리밋 완화
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((it) => fetchGarakAuctionPerKg(itemQueryName(it), dateISO)),
    );
    batch.forEach((it, j) => {
      const v = results[j];
      if (v != null) map.set(it.id, v);
    });
  }
  return map;
}

/**
 * 실시간 시세 피드 (DB 폴백 경로).
 *
 * 모든 가격은 원/kg 축이다. 값이 없거나 축 게이트에서 거부된 품목은
 * 피드에 넣지 않는다 — 샘플 더미로 채우지 않는다.
 */
export async function getPriceFeed(dateISO?: string): Promise<PriceFeed> {
  const todayISO = dateISO ?? kstDate(new Date());
  const catalog = servableCatalog();

  // 경락가 원천이 카테고리마다 다르다.
  //   청과 → 가락 도매시장 (법인별 조회, UUN으로 환산)
  //   수산 → 해수부 위판장  (금액÷중량으로 원/kg 직접 산출)
  const garakTargets = catalog.filter((i) => sourceMarketFor(i) === "garak");

  const [atMap, garakMap, fishMap, kamis] = await Promise.all([
    // aT는 한 번 호출로 시장 전체를 준다 — 품목별 반복 호출이 필요 없다
    fetchAtAuctionPerKg(todayISO, GARAK_WHSAL_CD),
    fetchGarakPerKgMap(garakTargets, todayISO),
    fetchFishMarketPerKg(todayISO),
    fetchKamisPrices(
      ["채소", "과일", "수산"],
      todayISO,
      kgPerConsumerUnitByName,
      extraKamisCategoryCodes(),
    ),
  ]);

  let auctionLive = false;
  let retailLive = false;
  const rejected: { name: string; reason: string }[] = [];
  const items: PriceItem[] = [];

  for (const base of catalog) {
    const k: KamisPrice | undefined = lookupBySourceName(kamis, base);
    const sourceMarket = sourceMarketFor(base);

    /*
     * KAMIS 시계열은 KAMIS 원천이다. 오늘값이 가락/aT에서 왔다면 이 시계열과
     * 비교할 수 없다 — 가격대가 달라 시세가 그대로여도 등락률이 크게 찍힌다
     * (배추 실측: 가락 1,895 vs KAMIS 1,128 → +68%).
     * 수산은 산지 위판가라 도매시장 시계열과는 유통 단계까지 다르다.
     *
     * 그래서 시계열은 일단 KAMIS 것으로 두되, **오늘값도 KAMIS에서 왔을 때만**
     * 비교에 쓴다. 아래에서 원천을 확정한 뒤 걸러낸다.
     */
    const kamisSeries =
      sourceMarket === "fish_market"
        ? []
        : normalizeSeries(
            (k?.seriesPerKg ?? []).map((p) => ({
              ...p,
              source: "kamis" as const,
            })),
          );

    const kamisToday =
      kamisSeries.filter((p) => p.date === todayISO).at(-1)?.price ?? null;

    let todayPerKg: number | null;
    let axisError: string | null;
    let priceSource: PriceSource | undefined;

    if (sourceMarket === "fish_market") {
      // 위판장은 금액÷중량이라 축이 자기완결적이다. 상식 범위 게이트는
      // 어댑터가 이미 걸었으므로 여기서는 거부 사유만 옮긴다.
      const fish: FishSpeciesPrice | undefined = lookupBySourceName(
        fishMap,
        base,
      );
      todayPerKg = fish && !fish.rejected ? fish.perKg : null;
      axisError = fish?.rejected ?? null;
      priceSource = todayPerKg != null ? "fish_market" : undefined;
    } else {
      const at = lookupBySourceName(atMap, base);
      const garak = garakMap.get(base.id) ?? null;
      ({ perKg: todayPerKg, rejected: axisError } = resolveAuctionPerKg(
        garak,
        kamisToday,
        at?.perKg ?? null,
      ));
      // 어느 원천이 채택됐는지 — 비교 가능 여부를 여기서 결정한다
      if (todayPerKg != null) {
        priceSource =
          at?.perKg === todayPerKg
            ? "at"
            : garak === todayPerKg
              ? "garak"
              : "kamis";
      }
    }

    if (axisError) {
      rejected.push({ name: base.name, reason: axisError });
      continue;
    }

    /*
     * 이월 판정에는 오늘값과 같은 원천 시계열만 쓴다.
     * (가락 값을 KAMIS 어제값으로 이월하면 원천이 바뀐 걸 숨기게 된다.)
     */
    const carrySeries =
      priceSource === "kamis" || todayPerKg == null ? kamisSeries : [];

    const resolved = resolveWithCarryForward(
      todayPerKg,
      carrySeries,
      todayISO,
    );
    if (!resolved) continue; // 실측 없음 → 비노출
    // 이월이면 원천은 시계열(KAMIS) 쪽이다
    if (resolved.status === "carried") priceSource = "kamis";

    const bandError = checkPlausible(base, resolved.perKg);
    if (bandError) {
      rejected.push({ name: base.name, reason: bandError });
      continue;
    }

    if (resolved.status === "live") auctionLive = true;
    if (k?.retailPerKg) retailLive = true;

    /*
     * 추세용 시계열은 **KAMIS 안에서 자기완결적으로** 구성한다.
     * 표시 가격이 가락이어도, 분위는 KAMIS 오늘값을 KAMIS 분포에 놓고 잰다.
     * 수산은 산지 위판가라 도매시장 시계열과 유통 단계가 달라 제외한다.
     */
    const useKamisTrend =
      sourceMarket === "garak" && kamisToday != null && kamisSeries.length > 0;

    const history = useKamisTrend
      ? normalizeSeries([
          ...kamisSeries,
          {
            date: todayISO,
            price: kamisToday!,
            label: "오늘",
            source: "kamis" as const,
          },
        ])
      : normalizeSeries([
          ...carrySeries,
          {
            date: todayISO,
            price: resolved.perKg,
            label: "오늘",
            source: priceSource,
          },
        ]);

    items.push({
      ...base,
      auctionPerKg: resolved.perKg,
      // 등락률은 두 값의 차이를 주장하므로 원천이 같을 때만 만든다
      auctionPrevPerKg: prevFromSeries(carrySeries, todayISO),
      trendPerKg: useKamisTrend ? kamisToday! : undefined,
      trendSource: useKamisTrend ? "kamis" : priceSource,
      /*
       * KAMIS 평년가(dpr7)는 KAMIS 원천이다. 오늘값이 가락/aT에서 왔다면
       * 기준선으로 쓸 수 없다 — 모든 품목에 원천 차이만큼의 상수 편차가 얹힌다.
       * 자체 이력이 쌓이면 DB 경로가 같은 원천 기준선을 준다.
       */
      // 평년가도 KAMIS 값과 비교할 때만 유효하다 (trendRef가 KAMIS일 때)
      auctionBaselinePerKg:
        useKamisTrend || priceSource === "kamis" ? (k?.baselinePerKg ?? 0) : 0,
      baselineMethod:
        (useKamisTrend || priceSource === "kamis") && k?.baselinePerKg
          ? "kamis_dpr7"
          : "none",
      retailPerKg: k?.retailPerKg,
      sourceMarket,
      priceSource,
      priceStatus: resolved.status,
      asOfDate: resolved.asOfDate,
      history,
    });
  }

  return {
    date: todayISO,
    market: buildMarketLabel(items),
    auctionSource: auctionLive ? "live" : "sample",
    retailSource: retailLive ? "live" : "sample",
    items: items.map(withSignal),
    rejected: rejected.length ? rejected : undefined,
  };
}
