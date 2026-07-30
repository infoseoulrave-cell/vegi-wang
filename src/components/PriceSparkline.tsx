"use client";

import type { PricePoint } from "@/lib/types";

/**
 * 최근 시세 스파크라인 (SVG). 라이브러리 없이 가볍게 표시.
 */
export function PriceSparkline({
  series,
  accent = "#1F9D55",
  className = "",
}: {
  series: PricePoint[];
  accent?: string;
  className?: string;
}) {
  const values = series.map((p) => p.price).filter((v) => v > 0);
  if (values.length < 2) {
    return (
      <div
        className={`flex h-12 items-center text-[11px] text-foreground/40 ${className}`}
      >
        시세 이력 수집 중
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const w = 160;
  const h = 48;
  const pad = 3;

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0]},${h} L${pts[0]![0]},${h} Z`;
  const [lx, ly] = pts[pts.length - 1]!;
  const rising = values[values.length - 1]! >= values[0]!;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`h-12 w-full ${className}`}
      role="img"
      aria-label="최근 시세 그래프"
    >
      <path d={area} fill={accent} opacity="0.12" />
      <path
        d={line}
        fill="none"
        stroke={rising ? "#E11D48" : accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r="3.2" fill={rising ? "#E11D48" : accent} />
    </svg>
  );
}
