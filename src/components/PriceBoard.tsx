"use client";

import { useMemo, useState } from "react";
import { CompassBadge, RetailGapBadge } from "@/components/CompassBadge";
import { signedPct, won } from "@/lib/format";
import type { PriceItemWithSignal, ProduceCategory } from "@/lib/types";

const TABS: Array<{ key: ProduceCategory | "전체"; label: string }> = [
  { key: "전체", label: "전체" },
  { key: "채소", label: "채소" },
  { key: "과일", label: "과일" },
  { key: "수산", label: "수산" },
];

export function PriceBoard({ items }: { items: PriceItemWithSignal[] }) {
  const [tab, setTab] = useState<ProduceCategory | "전체">("전체");

  const visible = useMemo(
    () => (tab === "전체" ? items : items.filter((i) => i.category === tab)),
    [items, tab],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-foreground/70 ring-1 ring-black/5 hover:bg-brand/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <article
            key={item.id}
            className="nums flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-brand/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold">{item.name}</h3>
                <p className="mt-0.5 text-xs text-foreground/50">
                  {item.origin} · {item.grade}
                </p>
              </div>
              <CompassBadge level={item.compass} />
            </div>

            {/* 소비자 단위(1개 등) 기준 도매가 */}
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-brand-dark">
                {item.consumerUnit} 도매가 (가락 경락가 기준)
              </p>
              <div className="flex items-end justify-between">
                <p className="text-2xl font-extrabold tracking-tight">
                  {won(item.consumerAuctionPrice)}
                </p>
                <p
                  className={`text-sm font-semibold ${
                    item.changeRate < 0
                      ? "text-emerald-600"
                      : item.changeRate > 0
                        ? "text-rose-600"
                        : "text-foreground/50"
                  }`}
                >
                  전일 {signedPct(item.changeRate)}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-foreground/50">
                실제 경매 {item.auctionUnit} {won(item.auctionPrice)} · 평년比{" "}
                <span className="font-semibold text-foreground/70">
                  {signedPct(item.deviationRate)}
                </span>
              </p>
            </div>

            {/* 소매가 대비 유통 지표 (소비자 단위 기준) */}
            <div className="mt-3 rounded-xl bg-background/60 p-3 ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground/60">
                  소매 {item.consumerUnit} 약 {won(item.consumerRetailPrice)}
                </span>
                <RetailGapBadge level={item.retailGap} />
              </div>
              <p className="mt-1 text-sm">
                <span className="font-bold text-brand-dark">
                  소매의 {item.retailMultiple}배
                </span>
                <span className="text-foreground/60">
                  {" "}
                  · {item.consumerUnit}당 {won(item.savingPerUnit)} 절약
                </span>
              </p>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-foreground/60">
              💡 {item.recommendation}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
