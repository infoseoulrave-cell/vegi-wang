import type {
  CompassLevel,
  PriceItem,
  PriceItemWithSignal,
  PricePoint,
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

function toConsumerSeries(
  series: PricePoint[],
  weightKg: number,
  kgPerConsumerUnit: number,
): PricePoint[] {
  if (!weightKg) return series;
  const factor = kgPerConsumerUnit / weightKg;
  return series.map((p) => ({
    ...p,
    price: Math.round(p.price * factor),
  }));
}

export function withSignal(item: PriceItem): PriceItemWithSignal {
  const auctionPerKg = Math.round(item.auctionPrice / item.weightKg);
  const changeRate = pct(item.auctionPrice, item.auctionPrevPrice);

  const history = normalizeSeries(item.history ?? []);
  const trend = analyzeTrend(history, item.auctionPrice);
  const baseline = trend.avg || item.auctionBaseline;
  const deviationRate = pct(item.auctionPrice, baseline);
  const compass = history.length
    ? trendToCompass(trend.position)
    : toCompass(deviationRate);
  const trendPosition = history.length
    ? trend.position
    : compass === "cheap"
      ? "low"
      : compass === "expensive"
        ? "high"
        : "mid";
  const trendPercentile = history.length
    ? trend.percentile
    : compass === "cheap"
      ? 20
      : compass === "expensive"
        ? 80
        : 50;

  const retailMultiple =
    Math.round((item.retailPricePerKg / auctionPerKg) * 100) / 100;
  const retailGap = toRetailGap(retailMultiple);
  const savingPerKg = Math.max(item.retailPricePerKg - auctionPerKg, 0);

  const consumerAuctionPrice = Math.round(
    auctionPerKg * item.kgPerConsumerUnit,
  );
  const consumerRetailPrice = Math.round(
    item.retailPricePerKg * item.kgPerConsumerUnit,
  );
  const savingPerUnit = Math.max(consumerRetailPrice - consumerAuctionPrice, 0);

  const chartSeries = toConsumerSeries(
    history.length
      ? history
      : [
          {
            date: "prev",
            price: item.auctionPrevPrice,
            label: "전일",
          },
          {
            date: "today",
            price: item.auctionPrice,
            label: "오늘",
          },
        ],
    item.weightKg,
    item.kgPerConsumerUnit,
  );

  return {
    ...item,
    history,
    auctionBaseline: baseline,
    auctionPerKg,
    changeRate,
    deviationRate,
    compass,
    trendPercentile,
    trendPosition,
    chartSeries,
    retailMultiple,
    retailGap,
    savingPerKg,
    consumerAuctionPrice,
    consumerRetailPrice,
    savingPerUnit,
    recommendation: buildTrendRecommendation(trendPosition, retailGap),
  };
}
