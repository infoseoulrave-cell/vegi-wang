"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { totalBasketSaving } from "@/lib/consumer-picks";
import { won } from "@/lib/format";
import type { PriceItemWithSignal } from "@/lib/types";

/**
 * 장바구니 절약 시뮬 — 관심 품목 수량을 담아 소매 대비 도매 환산 절약액을 보여준다.
 */
export function SavingsBasket({ items }: { items: PriceItemWithSignal[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim();
    const base = q
      ? items.filter((i) => i.name.includes(q) || i.category.includes(q))
      : items;
    // 절약액 큰 순으로 기본 노출
    return [...base].sort((a, b) => b.savingPerUnit - a.savingPerUnit);
  }, [items, query]);

  const totals = useMemo(() => totalBasketSaving(items, qty), [items, qty]);

  function setItemQty(id: string, next: number) {
    setQty((prev) => {
      const n = Math.max(0, Math.min(99, next));
      if (n === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: n };
    });
  }

  return (
    <section
      id="basket"
      className="mx-auto mt-16 w-full max-w-6xl scroll-mt-6 px-5"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">장바구니 절약 시뮬</h2>
          <p className="mt-1 text-sm text-foreground/50">
            살 품목 수량을 담아보세요. 소매 대신 도매 환산으로 얼마나 아끼는지
            바로 계산합니다.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="품목 검색"
          className="w-full max-w-xs rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 sm:w-48"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl bg-white p-3 ring-1 ring-black/5 sm:p-4">
          {visible.slice(0, 16).map((item) => {
            const q = qty[item.id] ?? 0;
            return (
              <div
                key={item.id}
                className="nums flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-background/80"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/items/${item.id}`}
                    className="font-bold hover:text-brand-dark"
                  >
                    {item.name}
                  </Link>
                  <p className="text-xs text-foreground/50">
                    {item.consumerUnit} 도매 {won(item.consumerAuctionPrice)} ·
                    소매 {won(item.consumerRetailPrice)} · 절약{" "}
                    <span className="font-semibold text-brand-dark">
                      {won(item.savingPerUnit)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="감소"
                    onClick={() => setItemQty(item.id, q - 1)}
                    className="h-8 w-8 rounded-lg bg-background text-lg font-bold ring-1 ring-black/5"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{q}</span>
                  <button
                    type="button"
                    aria-label="증가"
                    onClick={() => setItemQty(item.id, q + 1)}
                    className="h-8 w-8 rounded-lg bg-brand text-lg font-bold text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-sm">
          <p className="text-sm font-semibold text-white/80">오늘 예상 절약</p>
          <p className="nums mt-2 text-4xl font-extrabold tracking-tight">
            {won(totals.saving)}
          </p>
          <p className="mt-2 text-sm text-white/80">
            {totals.count}개 담음 · 소매 {won(totals.retail)} → 도매환산{" "}
            {won(totals.wholesale)}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-white/70">
            * 도매 환산은 가락 경락가를 소비자 단위로 나눈 참고값입니다. 실제
            구매 경로·수수료에 따라 달라질 수 있어요.
          </p>
          <a
            href="#waitlist"
            className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-dark"
          >
            관심 품목 저가 알림 받기
          </a>
        </div>
      </div>
    </section>
  );
}
