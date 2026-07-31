import type {
  CompassLevel,
  PriceItem,
  PriceItemWithSignal,
  PricePoint,
  PriceSourceMarket,
  RetailGapLevel,
} from "./types";
import {
  analyzeTrend,
  buildTrendRecommendation,
  normalizeSeries,
  trendToCompass,
} from "./trend";

/* ── 최근 동향 포지션 (시리즈 분위 기반) ─────────────────────── */

/** 하위호환: 시리즈가 없을 때 평균 대비 편차로 포지션 추정 */
export const CHEAP_THRESHOLD = -10;
export const EXPENSIVE_THRESHOLD = 10;

/* ── 유통 거품 지표 (소매가 ÷ 경락가, 원/kg 기준) ──────────── */
export const REASONABLE_MAX = 1.8;
export const BUBBLE_MIN = 2.5;

/**
 * 거품 판정을 적용할 수 있는 시장.
 *
 * 임계값 1.8 / 2.5는 **도매시장 → 소매** 한 단계를 전제로 잡힌 값이다.
 * 수산은 경락가가 **산지 위판가**라 유통 단계가 하나 더 많아 배수가 구조적으로
 * 크게 나온다. 같은 임계값을 들이대면 대부분이 '거품'으로 찍히는데,
 * 그건 유통 구조를 반영한 것이지 우리가 주장할 수 있는 판정이 아니다.
 *
 * 배수 자체는 그대로 보여주고, **판정만 유보한다.**
 * 실측 분포가 쌓이면 카테고리별 임계값을 잡아 다시 켠다.
 */
export function canJudgeRetailGap(sourceMarket: PriceSourceMarket): boolean {
  return sourceMarket === "garak";
}

export function pct(current: number, base: number): number {
  if (!base) return 0;
  return Math.round(((current - base) / base) * 1000) / 10;
}

export function toCompass(deviationRate: number): CompassLevel {
  if (deviationRate <= CHEAP_THRESHOLD) return "cheap";
  if (deviationRate >= EXPENSIVE_THRESHOLD) return "expensive";
  return "fair";
}

export function toRetailGap(multiple: number): RetailGapLevel {
  if (multiple < REASONABLE_MAX) return "reasonable";
  if (multiple >= BUBBLE_MIN) return "bubble";
  return "normal";
}

export const COMPASS_META: Record<
  CompassLevel,
  { label: string; hint: string; tone: string; dot: string }
> = {
  cheap: {
    label: "최근 저가권",
    hint: "최근 동향 대비 낮은 가격대",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  fair: {
    label: "최근 중위권",
    hint: "최근 동향 중간 가격대",
    tone: "bg-amber-50 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-500",
  },
  expensive: {
    label: "최근 고가권",
    hint: "최근 동향 대비 높은 가격대",
    tone: "bg-rose-50 text-rose-700 ring-rose-600/20",
    dot: "bg-rose-500",
  },
};

export const RETAIL_GAP_META: Record<
  RetailGapLevel,
  { label: string; tone: string }
> = {
  reasonable: {
    label: "소매가 합리적",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  normal: {
    label: "유통마진 보통",
    tone: "bg-slate-50 text-slate-600 ring-slate-500/20",
  },
  bubble: {
    label: "소매 거품 큼",
    tone: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
};

/** @deprecated 추세 추천으로 대체 — 테스트 하위호환용 */
export function buildRecommendation(
  compass: CompassLevel,
  gap: RetailGapLevel,
): string {
  const position =
    compass === "cheap" ? "low" : compass === "expensive" ? "high" : "mid";
  return buildTrendRecommendation(position, gap);
}

/** 원/kg 시리즈를 소비자 단위 환산 시리즈로 (곱하기만 한다) */
function toConsumerSeries(
  series: PricePoint[],
  kgPerConsumerUnit: number,
): PricePoint[] {
  if (!(kgPerConsumerUnit > 0)) return series;
  return series.map((p) => ({
    ...p,
    price: Math.round(p.price * kgPerConsumerUnit),
  }));
}

/**
 * 실측 원/kg 가격에 신호를 붙인다.
 *
 * 입력이 이미 원/kg 축이므로 **여기서는 어떤 나눗셈도 하지 않는다.**
 * 상자가·소비자단위가는 전부 곱해서 파생한다. 이 불변식이 깨지면
 * 예전처럼 weightKg로 두 번 나누는 버그가 되살아난다.
 */
export function withSignal(item: PriceItem): PriceItemWithSignal {
  const perKg = item.auctionPerKg;

  /*
   * 비교는 **같은 원천끼리만** 한다.
   *
   * 예전에는 오늘값(가락)을 KAMIS 시계열의 어제값과 비교했다. 두 원천의
   * 가격대가 다르므로(배추 실측: 가락 1,895 vs KAMIS 1,128) 시세가 그대로여도
   * +68%가 찍힌다. 프로덕션에서 시금치 +218%·감귤 +192%가 그렇게 나온 값이다.
   *
   * 이제 호출측이 같은 원천 시계열과 전일값만 넘긴다. 넘어오지 않으면
   * 지표를 만들지 않고 undefined로 두어 UI가 감춘다.
   */
  const changeRate =
    item.auctionPrevPerKg != null && item.auctionPrevPerKg > 0
      ? pct(perKg, item.auctionPrevPerKg)
      : undefined;

  const history = normalizeSeries(item.history ?? []);
  // 오늘 한 점만 있는 시계열은 추세가 아니다
  const hasSeries = history.filter((p) => p.price > 0).length >= 2;
  /*
   * 분위·편차는 **시계열과 같은 원천 값**으로 계산한다.
   * 표시 가격(가락)을 KAMIS 분포에 끼워 넣으면 원천 차이만큼 위로 밀려
   * 모든 품목이 '고가권'이 된다.
   */
  const trendRef = item.trendPerKg ?? perKg;
  const trend = analyzeTrend(history, trendRef);
  const baseline = item.auctionBaselinePerKg || (hasSeries ? trend.avg : 0);
  const deviationRate = baseline > 0 ? pct(trendRef, baseline) : undefined;

  const trendBasis: PriceItemWithSignal["trendBasis"] = hasSeries
    ? "series"
    : deviationRate != null
      ? "baseline"
      : "none";

  const compass = hasSeries
    ? trendToCompass(trend.position)
    : deviationRate != null
      ? toCompass(deviationRate)
      : "fair";
  const trendPosition = hasSeries
    ? trend.position
    : compass === "cheap"
      ? "low"
      : compass === "expensive"
        ? "high"
        : "mid";
  const trendPercentile = hasSeries
    ? trend.percentile
    : compass === "cheap"
      ? 20
      : compass === "expensive"
        ? 80
        : 50;

  // 거품 배수는 양쪽이 모두 실측일 때만 산출한다. 한쪽이 없으면 표시하지 않는다.
  const hasRetail = item.retailPerKg != null && item.retailPerKg > 0;
  const retailMultiple =
    hasRetail && perKg > 0
      ? Math.round((item.retailPerKg! / perKg) * 100) / 100
      : undefined;
  const retailGap =
    retailMultiple != null && canJudgeRetailGap(item.sourceMarket)
      ? toRetailGap(retailMultiple)
      : undefined;
  const savingPerKg = hasRetail
    ? Math.max(item.retailPerKg! - perKg, 0)
    : undefined;

  const auctionUnitPrice = Math.round(perKg * item.weightKg);
  const consumerAuctionPrice = Math.round(perKg * item.kgPerConsumerUnit);
  const consumerRetailPrice = hasRetail
    ? Math.round(item.retailPerKg! * item.kgPerConsumerUnit)
    : undefined;
  const savingPerUnit =
    consumerRetailPrice != null
      ? Math.max(consumerRetailPrice - consumerAuctionPrice, 0)
      : undefined;

  const chartSeries = toConsumerSeries(history, item.kgPerConsumerUnit);

  return {
    ...item,
    history,
    auctionBaselinePerKg: baseline,
    changeRate,
    deviationRate,
    trendBasis,
    compass,
    trendPercentile,
    trendPosition,
    chartSeries,
    auctionUnitPrice,
    retailMultiple,
    retailGap,
    savingPerKg,
    consumerAuctionPrice,
    consumerRetailPrice,
    savingPerUnit,
    recommendation: buildTrendRecommendation(trendPosition, retailGap, trendBasis),
  };
}
