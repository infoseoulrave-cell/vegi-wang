"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { priceStatusLabel, trendSourceLabel, won } from "@/lib/format";
import type { PriceItemWithSignal } from "@/lib/types";

/**
 * 홈 상단 시세 그래프.
 *
 * 표 안의 스파크라인만으로는 "경매가·최근 동향 그래프"라는 이름값을 못 한다.
 * 상세 페이지에만 있던 전체 차트를 앞으로 끌어내고, 품목은 칩으로 고른다.
 * 카드 전체가 상세 링크라 카드를 선택 UI로 쓰면 기존 이동이 깨진다.
 */
export function FeaturedChart({ items }: { items: PriceItemWithSignal[] }) {
  // 곡선은 관측 — 판정 게이트와 무관하게 점 2개 이상이면 그린다
  const charted = useMemo(
    () => items.filter((i) => i.chartSeries.length >= 2),
    [items],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  /*
   * 선택은 상태로 저장하되 화면에 쓰는 값은 파생시킨다.
   * 탭이 바뀌어 고른 품목이 목록에서 사라져도 아래 폴백이 받아내므로,
   * effect로 상태를 되돌릴 필요가 없다(그러면 렌더가 한 번 더 돈다).
   */
  const item = charted.find((i) => i.id === selectedId) ?? charted[0];
  if (!item) return null;

  const first = item.chartSeries[0]!;
  const last = item.chartSeries[item.chartSeries.length - 1]!;
  const diff = last.price - first.price;
  const pct = first.price > 0 ? (diff / first.price) * 100 : 0;
  const rising = diff > 0;
  const statusLabel = priceStatusLabel(item.priceStatus, item.asOfDate);

  return (
    <section className="mb-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-extrabold tracking-tight">
              {item.name}
            </h3>
            {statusLabel && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                {statusLabel}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-foreground/50">
            {item.consumerUnit} 기준 · 도매 시세
            {trendSourceLabel(item.trendSource) && (
              <span className="ml-1 text-foreground/40">
                ({trendSourceLabel(item.trendSource)})
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="nums text-2xl font-extrabold tracking-tight">
            {won(last.price * (item.kgPerConsumerUnit ?? 1))}
          </p>
          <p
            className={`nums text-xs font-semibold ${
              rising ? "text-rose-600" : diff < 0 ? "text-emerald-600" : "text-foreground/45"
            }`}
          >
            {first.label ?? "처음"} 대비 {rising ? "▲" : diff < 0 ? "▼" : "―"}{" "}
            {Math.abs(pct).toFixed(1)}%
          </p>
        </div>
      </div>

      <PriceHistoryChart
        className="mt-3"
        series={item.chartSeries}
        unitLabel={item.consumerUnit}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          {charted.map((c) => {
            const on = c.id === item.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-pressed={on}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                  on
                    ? "bg-brand text-white shadow-sm"
                    : "bg-background text-foreground/60 ring-1 ring-black/5 hover:bg-brand/5"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <Link
          href={`/items/${item.id}`}
          className="shrink-0 text-xs font-semibold text-brand hover:underline"
        >
          자세히 →
        </Link>
      </div>
    </section>
  );
}
