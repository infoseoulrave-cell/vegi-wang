import {
  itemQueryName,
  kgPerConsumerUnitByName,
  lookupBySourceName,
  servableCatalog,
  sourceMarketFor,
} from "./catalog";
import { withSignal } from "./compass";
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
 * 경락가 원/kg를 확정한다.
 *
 * 가락이 우선이다 — 행마다 UUN을 주므로 자기완결적 환산이 되고 추정이 없다.
 * KAMIS 도매는 슬롯마다 축이 달라 주 원천으로 쓸 수 없고, 교차검증과
 * 가락 결측 시 부트스트랩에만 쓴다.
 */
export function resolveAuctionPerKg(
  garakPerKg: number | null | undefined,
  kamisPerKg: number | null | undefined,
): AxisResolution {
  const g = garakPerKg != null && garakPerKg > 0 ? garakPerKg : null;
  const k = kamisPerKg != null && kamisPerKg > 0 ? kamisPerKg : null;

  if (g == null && k == null) return { perKg: null, rejected: null };
  if (g == null) return { perKg: k, rejected: null };
  if (k == null) return { perKg: g, rejected: null };

  const ratio = g > k ? g / k : k / g;
  if (ratio >= AXIS_DIVERGENCE_LIMIT) {
    return {
      perKg: null,
      rejected: `축 불일치 — 가락 ${g}원/kg vs KAMIS ${k}원/kg (${ratio.toFixed(1)}배)`,
    };
  }
  return { perKg: g, rejected: null };
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

/** 직전 영업일 값 — 없으면 오늘 값(등락률 0) */
function prevFromSeries(
  series: PricePoint[],
  todayISO: string,
  fallback: number,
): number {
  const older = series
    .filter((p) => p.date < todayISO && p.price > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  return older[0]?.price ?? fallback;
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

  const [garakMap, fishMap, kamis] = await Promise.all([
    fetchGarakPerKgMap(garakTargets, todayISO),
    fetchFishMarketPerKg(todayISO),
    fetchKamisPrices(
      ["채소", "과일", "수산"],
      todayISO,
      kgPerConsumerUnitByName,
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
     * KAMIS 도매 시계열은 **도매시장** 가격이다. 수산의 오늘값은 **산지 위판가**라
     * 유통 단계가 한 칸 다르다. 둘 다 원/kg 축이어도 섞으면 추세가 왜곡되므로
     * (산지가 대체로 낮아 항상 '고가권'으로 보임) 수산은 경락 축 이력을 비운다.
     * 자체 위판 이력은 DB가 쌓이면서 채워진다.
     */
    const series =
      sourceMarket === "fish_market"
        ? []
        : normalizeSeries(k?.seriesPerKg ?? []);

    const kamisToday =
      series.filter((p) => p.date === todayISO).at(-1)?.price ?? null;

    let todayPerKg: number | null;
    let axisError: string | null;

    if (sourceMarket === "fish_market") {
      // 위판장은 금액÷중량이라 축이 자기완결적이다. 상식 범위 게이트는
      // 어댑터가 이미 걸었으므로 여기서는 거부 사유만 옮긴다.
      const fish: FishSpeciesPrice | undefined = lookupBySourceName(
        fishMap,
        base,
      );
      todayPerKg = fish && !fish.rejected ? fish.perKg : null;
      axisError = fish?.rejected ?? null;
    } else {
      ({ perKg: todayPerKg, rejected: axisError } = resolveAuctionPerKg(
        garakMap.get(base.id),
        kamisToday,
      ));
    }

    if (axisError) {
      rejected.push({ name: base.name, reason: axisError });
      continue;
    }

    const resolved = resolveWithCarryForward(todayPerKg, series, todayISO);
    if (!resolved) continue; // 실측 없음 → 비노출

    const bandError = checkPlausible(base, resolved.perKg);
    if (bandError) {
      rejected.push({ name: base.name, reason: bandError });
      continue;
    }

    if (resolved.status === "live") auctionLive = true;
    if (k?.retailPerKg) retailLive = true;

    const history = normalizeSeries([
      ...series,
      { date: todayISO, price: resolved.perKg, label: "오늘" },
    ]);

    items.push({
      ...base,
      auctionPerKg: resolved.perKg,
      auctionPrevPerKg: prevFromSeries(series, todayISO, resolved.perKg),
      // 수산은 KAMIS 평년가(도매시장)를 위판가의 기준선으로 쓸 수 없다.
      // 기준선 없음을 명시하면 UI가 편차 문구를 숨긴다.
      auctionBaselinePerKg:
        sourceMarket === "fish_market" ? 0 : (k?.baselinePerKg ?? 0),
      baselineMethod:
        sourceMarket === "fish_market"
          ? "none"
          : k?.baselinePerKg
            ? "kamis_dpr7"
            : "none",
      retailPerKg: k?.retailPerKg,
      sourceMarket,
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
