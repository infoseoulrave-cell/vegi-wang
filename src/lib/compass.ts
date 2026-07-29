import type {
  CompassLevel,
  PriceItem,
  PriceItemWithSignal,
  RetailGapLevel,
} from "./types";

/* ── 살 타이밍 나침반 (경락가 vs 평년) ───────────────────────── */

/** 평년보다 이만큼(%) 이상 싸면 "사기 좋은 날" */
export const CHEAP_THRESHOLD = -10;
/** 평년보다 이만큼(%) 이상 비싸면 "관망" */
export const EXPENSIVE_THRESHOLD = 10;

/* ── 유통 거품 지표 (소매가 ÷ 경락가, 원/kg 기준) ────────────
 * 도매 경락가가 소매가로 넘어오며 몇 배가 되는지.
 * 품목마다 정상 배수가 다르므로 아래는 조정 가능한 휴리스틱 기본값이며,
 * 향후 품목별 과거 배수 분포로 정교화한다. */
export const REASONABLE_MAX = 1.8; // 이 미만이면 소매가 합리적
export const BUBBLE_MIN = 2.5; // 이 이상이면 소매 거품 큼

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
    label: "사기 좋은 날",
    hint: "경락가가 평년보다 쌉니다",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  fair: {
    label: "적정",
    hint: "경락가가 평년 수준입니다",
    tone: "bg-amber-50 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-500",
  },
  expensive: {
    label: "관망 권장",
    hint: "경락가가 평년보다 비쌉니다",
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

/** 살 타이밍 + 유통 거품을 결합한 소비자용 추천 문구 */
export function buildRecommendation(
  compass: CompassLevel,
  gap: RetailGapLevel,
): string {
  if (compass === "expensive") {
    return "평년보다 비싼 시기 — 급하지 않다면 관망을 권합니다.";
  }
  if (compass === "cheap") {
    return gap === "bubble"
      ? "도매가는 저렴한데 소매 거품이 큽니다 — 도매시장·산지직송이 특히 이득."
      : "도매·소매 모두 지금이 사기 좋은 날입니다.";
  }
  // fair
  return gap === "bubble"
    ? "경락가는 평이하지만 소매 거품이 큽니다 — 직거래가 유리합니다."
    : "평년 수준의 무난한 시세입니다.";
}

export function withSignal(item: PriceItem): PriceItemWithSignal {
  const auctionPerKg = Math.round(item.auctionPrice / item.weightKg);
  const changeRate = pct(item.auctionPrice, item.auctionPrevPrice);
  const deviationRate = pct(item.auctionPrice, item.auctionBaseline);
  const compass = toCompass(deviationRate);

  const retailMultiple =
    Math.round((item.retailPricePerKg / auctionPerKg) * 100) / 100;
  const retailGap = toRetailGap(retailMultiple);
  const savingPerKg = Math.max(item.retailPricePerKg - auctionPerKg, 0);

  return {
    ...item,
    auctionPerKg,
    changeRate,
    deviationRate,
    compass,
    retailMultiple,
    retailGap,
    savingPerKg,
    recommendation: buildRecommendation(compass, retailGap),
  };
}
