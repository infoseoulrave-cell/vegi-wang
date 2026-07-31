"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChangeRate } from "@/components/ChangeRate";
import { CompassBadge, RetailGapBadge } from "@/components/CompassBadge";
import { PriceSparkline } from "@/components/PriceSparkline";
import { categoryHref } from "@/lib/categories";
import { COMPASS_META } from "@/lib/compass";
import {
  baselineLabel,
  multiple,
  priceStatusLabel,
  signedPct,
  won,
} from "@/lib/format";
import {
  SOURCE_MARKET_SHORT,
  type PriceItemWithSignal,
  type ProduceCategory,
} from "@/lib/types";

const TABS: Array<{ key: ProduceCategory | "전체"; label: string }> = [
  { key: "전체", label: "전체" },
  { key: "채소", label: "채소" },
  { key: "과일", label: "과일" },
  { key: "수산", label: "수산" },
];

function ItemThumb({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-sm font-bold text-brand-dark ring-1 ring-brand/15">
        {name.slice(0, 1)}
      </div>
    );
  }
  return (
    <Image
      src={`/images/items/${id}.png`}
      alt={name}
      width={56}
      height={56}
      className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-black/5"
      onError={() => setFailed(true)}
    />
  );
}

export function PriceBoard({
  items,
  lockedCategory,
}: {
  items: PriceItemWithSignal[];
  /** 지정 시 해당 카테고리만 표시하고 탭 숨김 (카테고리 전용 페이지) */
  lockedCategory?: ProduceCategory;
}) {
  const [tab, setTab] = useState<ProduceCategory | "전체">(
    lockedCategory ?? "전체",
  );

  const visible = useMemo(() => {
    if (lockedCategory) {
      return items.filter((i) => i.category === lockedCategory);
    }
    return tab === "전체" ? items : items.filter((i) => i.category === tab);
  }, [items, tab, lockedCategory]);

  return (
    <div>
      {!lockedCategory && (
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const className = `rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-foreground/70 ring-1 ring-black/5 hover:bg-brand/5"
            }`;
            if (t.key === "전체") {
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={className}
                >
                  {t.label}
                </button>
              );
            }
            return (
              <Link key={t.key} href={categoryHref(t.key)} className={className}>
                {t.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => {
          const meta = COMPASS_META[item.compass];
          return (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className="nums flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-brand/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <ItemThumb id={item.id} name={item.name} />
                  <div>
                    <h3 className="text-lg font-bold">{item.name}</h3>
                    <p className="mt-0.5 text-xs text-foreground/50">
                      {item.origin} · {item.grade}
                    </p>
                  </div>
                </div>
                {item.trendBasis !== "none" && (
                  <CompassBadge level={item.compass} />
                )}
              </div>

              {/* 추세 근거가 없으면 분위·스파크라인을 만들어내지 않는다 */}
              {item.trendBasis === "series" ? (
                <div className="mt-4 rounded-xl bg-background/70 px-3 py-2 ring-1 ring-black/5">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-foreground/55">
                      최근 시세 동향
                    </p>
                    <p className="text-[11px] font-medium text-foreground/50">
                      분위 {Math.round(item.trendPercentile)}% · {meta.label}
                    </p>
                  </div>
                  <PriceSparkline series={item.chartSeries} />
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-background/70 px-3 py-2 text-[11px] text-foreground/45 ring-1 ring-black/5">
                  시세 동향은 이력이 쌓이면 표시됩니다
                </div>
              )}

              <div className="mt-4">
                <p className="text-[11px] font-semibold text-brand-dark">
                  {item.consumerUnit} 도매가 ({SOURCE_MARKET_SHORT[item.sourceMarket]} 기준)
                  {priceStatusLabel(item.priceStatus, item.asOfDate) && (
                    <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      {priceStatusLabel(item.priceStatus, item.asOfDate)}
                    </span>
                  )}
                </p>
                <div className="flex items-end justify-between">
                  <p className="text-2xl font-extrabold tracking-tight">
                    {won(item.consumerAuctionPrice)}
                  </p>
                  <ChangeRate value={item.changeRate} />
                </div>
                <p className="mt-0.5 text-xs text-foreground/50">
                  실제 경매 {item.auctionUnit} {won(item.auctionUnitPrice)}
                  {item.deviationRate != null &&
                    baselineLabel(item.baselineMethod) && (
                      <>
                        {" · "}
                        {baselineLabel(item.baselineMethod)}比{" "}
                        <span className="font-semibold text-foreground/70">
                          {signedPct(item.deviationRate)}
                        </span>
                      </>
                    )}
                </p>
              </div>

              <div className="mt-3 rounded-xl bg-background/60 p-3 ring-1 ring-black/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground/60">
                    {item.consumerRetailPrice != null
                      ? `소매 ${item.consumerUnit} 약 ${won(item.consumerRetailPrice)}`
                      : "소매가 미확인"}
                  </span>
                  <RetailGapBadge level={item.retailGap} />
                </div>
                {/* 소매가가 없으면 배수·절약액을 지어내지 않는다 */}
                {item.retailMultiple != null ? (
                  <p className="mt-1 text-sm">
                    <span className="font-bold text-brand-dark">
                      소매의 {multiple(item.retailMultiple)}
                    </span>
                    <span className="text-foreground/60">
                      {" "}
                      · {item.consumerUnit}당 {won(item.savingPerUnit)} 절약
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-foreground/45">
                    소매 조사가가 없어 유통 거품을 계산하지 않았습니다
                  </p>
                )}
              </div>

              <p className="mt-3 text-xs leading-relaxed text-foreground/60">
                {item.recommendation}
              </p>
              <p className="mt-3 text-xs font-semibold text-brand-dark">
                상세 그래프 보기 →
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
