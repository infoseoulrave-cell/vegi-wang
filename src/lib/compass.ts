import type { CompassLevel, PriceItem, PriceItemWithSignal } from "./types";

/** 기준가 대비 이만큼(%) 이상 싸면 "사기 좋은 날" */
export const CHEAP_THRESHOLD = -10;
/** 기준가 대비 이만큼(%) 이상 비싸면 "관망" */
export const EXPENSIVE_THRESHOLD = 10;

export function pct(current: number, base: number): number {
  if (!base) return 0;
  return Math.round(((current - base) / base) * 1000) / 10;
}

export function toCompass(deviationRate: number): CompassLevel {
  if (deviationRate <= CHEAP_THRESHOLD) return "cheap";
  if (deviationRate >= EXPENSIVE_THRESHOLD) return "expensive";
  return "fair";
}

export const COMPASS_META: Record<
  CompassLevel,
  { label: string; hint: string; tone: string; dot: string }
> = {
  cheap: {
    label: "사기 좋은 날",
    hint: "평년보다 쌉니다",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  fair: {
    label: "적정",
    hint: "평년 수준입니다",
    tone: "bg-amber-50 text-amber-700 ring-amber-600/20",
    dot: "bg-amber-500",
  },
  expensive: {
    label: "관망 권장",
    hint: "평년보다 비쌉니다",
    tone: "bg-rose-50 text-rose-700 ring-rose-600/20",
    dot: "bg-rose-500",
  },
};

export function withSignal(item: PriceItem): PriceItemWithSignal {
  const changeRate = pct(item.todayPrice, item.prevPrice);
  const deviationRate = pct(item.todayPrice, item.baselinePrice);
  return {
    ...item,
    changeRate,
    deviationRate,
    compass: toCompass(deviationRate),
  };
}
