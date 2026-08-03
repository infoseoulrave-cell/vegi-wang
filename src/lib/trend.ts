import { addDaysISO } from "@/server/domain/date";
import type { CompassLevel, PricePoint, TrendPosition } from "./types";

/** 최근 시세 창에서 하위권으로 볼 분위(%) */
export const TREND_LOW_MAX = 33;
/** 최근 시세 창에서 고가권으로 볼 분위(%) */
export const TREND_HIGH_MIN = 67;

/** 타이밍 판정에 쓰는 최근 관측 창(일) */
export const TIMING_WINDOW_DAYS = 21;
/** 창 안에서 필요한 최소 관측일 수 */
export const TIMING_MIN_OBSERVED_DAYS = 10;

export interface TimingGate {
  ok: boolean;
  observedDays: number;
  windowDays: number;
}

/**
 * 최근 동향 분위·추천을 낼 만큼 이력이 모였는지.
 *
 * - 창의 기준점은 시리즈 끝이 아니라 asOfDate(오늘).
 * - 같은 날짜 중복은 하루로 접는다.
 * - excludeDates의 날은 관측으로 세지 않는다(이월된 "오늘" 점).
 */
export function canJudgeTiming(
  series: readonly PricePoint[],
  asOfDate: string,
  opts?: { excludeDates?: ReadonlySet<string> | readonly string[] },
): TimingGate {
  const windowDays = TIMING_WINDOW_DAYS;
  const start = addDaysISO(asOfDate, -(windowDays - 1));
  const excluded = opts?.excludeDates
    ? opts.excludeDates instanceof Set
      ? opts.excludeDates
      : new Set(opts.excludeDates)
    : null;

  const observed = new Set<string>();
  for (const p of series) {
    if (!p.date || !(p.price > 0)) continue;
    if (p.date < start || p.date > asOfDate) continue;
    if (excluded?.has(p.date)) continue;
    observed.add(p.date);
  }

  const observedDays = observed.size;
  return {
    ok: observedDays >= TIMING_MIN_OBSERVED_DAYS,
    observedDays,
    windowDays,
  };
}

/**
 * 현재가가 시리즈 안에서 몇 %ile인지 (0=최저, 100=최고).
 * 동률은 평균 순위로 처리.
 */
export function percentileRank(values: number[], current: number): number {
  const nums = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length || !Number.isFinite(current) || current <= 0) return 50;
  const below = nums.filter((v) => v < current).length;
  const equal = nums.filter((v) => v === current).length;
  const rank = below + equal / 2;
  return Math.round((rank / nums.length) * 1000) / 10;
}

export function toTrendPosition(percentile: number): TrendPosition {
  if (percentile <= TREND_LOW_MAX) return "low";
  if (percentile >= TREND_HIGH_MIN) return "high";
  return "mid";
}

/** UI/기존 나침반 레벨과 매핑 (low=cheap …) */
export function trendToCompass(position: TrendPosition): CompassLevel {
  if (position === "low") return "cheap";
  if (position === "high") return "expensive";
  return "fair";
}

export function analyzeTrend(
  series: PricePoint[],
  currentPrice: number,
): {
  percentile: number;
  position: TrendPosition;
  min: number;
  max: number;
  avg: number;
} {
  const values = series.map((p) => p.price).filter((v) => v > 0);
  if (currentPrice > 0) values.push(currentPrice);
  const percentile = percentileRank(values, currentPrice);
  const position = toTrendPosition(percentile);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const avg = values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0;
  return { percentile, position, min, max, avg };
}

export function buildTrendRecommendation(
  position: TrendPosition,
  retailGap?: "reasonable" | "normal" | "bubble",
  basis: "series" | "baseline" | "none" = "series",
): string {
  // 추세 근거가 없으면 타이밍을 말하지 않는다
  if (basis === "none") {
    return "오늘 실측 시세입니다. 타이밍 판정은 최근 이력이 더 모이면 표시됩니다.";
  }
  if (position === "high") {
    return "최근 동향 기준 고가권입니다 — 급하지 않다면 추이를 더 지켜보세요.";
  }
  if (position === "low") {
    return retailGap === "bubble"
      ? "최근 동향 속 저가권입니다. 소매 대비 배수가 커서 구매 경로를 함께 비교해 보세요."
      : "최근 동향 기준 저가권입니다 — 담기 좋은 타이밍으로 보기 좋습니다.";
  }
  return retailGap === "bubble"
    ? "최근 중위권 시세입니다. 소매 대비 배수가 있어 경로를 비교해 보세요."
    : "최근 동향 기준 중위권 — 무난한 시세대입니다.";
}

/** 시리즈를 날짜 오름차순으로 정리하고 중복 날짜는 마지막 값 유지 */
export function normalizeSeries(points: PricePoint[]): PricePoint[] {
  const map = new Map<string, PricePoint>();
  for (const p of points) {
    if (!p.date || !(p.price > 0)) continue;
    map.set(p.date, p);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
