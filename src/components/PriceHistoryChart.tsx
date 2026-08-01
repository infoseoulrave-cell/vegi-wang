"use client";

import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import { won } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

type RangeKey = "7" | "14" | "30" | "all";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "7", label: "1주" },
  { key: "14", label: "2주" },
  { key: "30", label: "1개월" },
  { key: "all", label: "전체" },
];

function filterByRange(series: PricePoint[], range: RangeKey): PricePoint[] {
  if (range === "all" || series.length === 0) return series;
  const days = Number(range);
  const last = series[series.length - 1]!.date;
  const cutoff = new Date(`${last}T12:00:00+09:00`);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutISO = cutoff.toISOString().slice(0, 10);
  const filtered = series.filter((p) => p.date >= cutISO);
  return filtered.length >= 2 ? filtered : series;
}

function fmtAxisDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 주식형 가격 동향 차트 — SVG + 크로스헤어 호버.
 */
export function PriceHistoryChart({
  series,
  unitLabel,
  className = "",
}: {
  series: PricePoint[];
  unitLabel: string;
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("all");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = useMemo(() => filterByRange(series, range), [series, range]);
  const values = data.map((p) => p.price);

  const width = 720;
  const height = 360;
  const pad = { top: 24, right: 20, bottom: 36, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = Math.max(max - min, 1);
  // 위아래 여유
  const yMin = Math.max(0, min - span * 0.08);
  const yMax = max + span * 0.08;
  const ySpan = Math.max(yMax - yMin, 1);

  /*
   * x는 인덱스가 아니라 실제 날짜에 비례해야 한다.
   *
   * 시리즈에는 자체 일별 이력과 KAMIS 앵커(1년전·1개월전·1주일전·오늘)가
   * 섞여 들어온다. 등간격으로 그리면 1년 간격과 하루 간격이 같은 폭이 되어,
   * 오래전부터 완만했던 변화가 최근의 급등처럼 보인다. 없는 움직임을
   * 만들어내는 셈이라 축을 날짜로 잡는다.
   */
  const times = useMemo(
    () => data.map((p) => new Date(`${p.date}T12:00:00+09:00`).getTime()),
    [data],
  );
  const tMin = times.length ? Math.min(...times) : 0;
  const tSpan = times.length ? Math.max(...times) - tMin : 0;

  const xAt = useCallback(
    (i: number) => {
      if (data.length <= 1) return pad.left + innerW / 2;
      // 모든 점이 같은 날짜면 날짜 비례가 성립하지 않는다 — 균등 배치로 물러난다
      if (tSpan <= 0) return pad.left + (i / (data.length - 1)) * innerW;
      return pad.left + ((times[i]! - tMin) / tSpan) * innerW;
    },
    [data.length, innerW, pad.left, times, tMin, tSpan],
  );
  const yAt = useCallback(
    (v: number) => pad.top + (1 - (v - yMin) / ySpan) * innerH,
    [innerH, pad.top, yMin, ySpan],
  );

  const pts = data.map((p, i) => ({ ...p, x: xAt(i), y: yAt(p.price) }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area =
    pts.length > 0
      ? `${line} L${pts[pts.length - 1]!.x},${pad.top + innerH} L${pts[0]!.x},${pad.top + innerH} Z`
      : "";

  const rising =
    values.length >= 2 && values[values.length - 1]! >= values[0]!;
  const stroke = rising ? "#E11D48" : "#1F9D55";
  const fill = rising ? "#E11D48" : "#1F9D55";

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) =>
    Math.round(yMin + (ySpan * i) / (yTicks - 1)),
  );

  /*
   * 눈금도 인덱스가 아니라 좌표로 고른다. 날짜 비례 축에서는 가운데 인덱스가
   * 끝점 바로 옆에 붙을 수 있어(1년전·1개월전·1주일전·오늘 → 가운데가 오른쪽 끝
   * 근처), 인덱스로 뽑으면 라벨이 겹친다. 최소 간격을 두고 훑는다.
   */
  const MIN_TICK_GAP = 84;
  const xTickIdx = useMemo(() => {
    if (data.length <= 1) return [0];
    const last = data.length - 1;
    const kept = [0];
    for (let i = 1; i < last; i += 1) {
      if (xAt(i) - xAt(kept[kept.length - 1]!) >= MIN_TICK_GAP) kept.push(i);
    }
    // 마지막 점은 항상 보여주되, 직전 눈금과 붙으면 그 눈금을 물린다
    while (kept.length && xAt(last) - xAt(kept[kept.length - 1]!) < MIN_TICK_GAP)
      kept.pop();
    kept.push(last);
    return kept;
  }, [data.length, xAt]);

  const active = hover != null ? pts[hover] : pts[pts.length - 1];
  const activeIdx = hover ?? pts.length - 1;

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || pts.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  }

  if (data.length < 2) {
    return (
      <div
        className={`flex h-[360px] items-center justify-center rounded-2xl bg-white text-sm text-foreground/45 ring-1 ring-black/5 ${className}`}
      >
        표시할 가격 이력이 아직 부족합니다
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground/50">
            {unitLabel} 도매가 추이
          </p>
          <p className="nums mt-1 text-3xl font-extrabold tracking-tight">
            {won(active?.price ?? 0)}
          </p>
          <p className="mt-1 text-xs text-foreground/50">
            {active?.date}
            {active?.label ? ` · ${active.label}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                range === r.key
                  ? "bg-brand text-white"
                  : "bg-background text-foreground/60 ring-1 ring-black/5 hover:bg-brand/5"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label={`${unitLabel} 가격 동향 그래프`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* grid */}
        {yTickVals.map((v) => {
          const y = yAt(v);
          return (
            <g key={v}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#14231A"
                strokeOpacity="0.06"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="nums"
                fill="#14231A"
                fillOpacity="0.45"
                fontSize="11"
              >
                {v.toLocaleString("ko-KR")}
              </text>
            </g>
          );
        })}

        {xTickIdx.map((i) => (
          <text
            key={`x-${i}`}
            x={xAt(i)}
            y={height - 12}
            textAnchor="middle"
            fill="#14231A"
            fillOpacity="0.45"
            fontSize="11"
          >
            {fmtAxisDate(data[i]!.date)}
          </text>
        ))}

        <path d={area} fill={fill} fillOpacity="0.12" />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* hover crosshair */}
        {active && (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="#14231A"
              strokeOpacity="0.2"
              strokeDasharray="4 4"
            />
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={active.y}
              y2={active.y}
              stroke="#14231A"
              strokeOpacity="0.12"
              strokeDasharray="4 4"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="5"
              fill="#fff"
              stroke={stroke}
              strokeWidth="2.5"
            />
          </g>
        )}

        {/* invisible hit targets */}
        {pts.map((p, i) => (
          <circle
            key={p.date + i}
            cx={p.x}
            cy={p.y}
            r="10"
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      <p className="mt-1 text-[11px] text-foreground/40">
        포인트 {data.length}개
        {activeIdx >= 0 ? ` · 선택 ${activeIdx + 1}/${data.length}` : ""}
        · 드래그/호버로 날짜별 가격 확인
      </p>
    </div>
  );
}
