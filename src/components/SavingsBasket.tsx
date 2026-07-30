import Link from "next/link";
import { CompassBadge, RetailGapBadge } from "@/components/CompassBadge";
import { buildSavingsBasket } from "@/lib/consumer-picks";
import { won } from "@/lib/format";
import type { PriceItemWithSignal } from "@/lib/types";

/**
 * 절약 바구니 — 판매가 아님.
 * 소매 거품이 큰 종목이 아니라, 오늘 시세·유통마진이 괜찮은데
 * 소매 대비 실질 이득이 있는 품목을 보여준다.
 */
export function SavingsBasket({ items }: { items: PriceItemWithSignal[] }) {
  const basket = buildSavingsBasket(items);
  const totalIfOneEach = basket.reduce((s, i) => s + i.savingPerUnit, 0);

  if (!basket.length) return null;

  return (
    <section
      id="savings-basket"
      className="mx-auto mt-16 w-full max-w-6xl scroll-mt-6 px-5"
    >
      <div className="mb-5">
        <h2 className="text-2xl font-bold">오늘의 절약 바구니</h2>
        <p className="mt-1 max-w-2xl text-sm text-foreground/50">
          베지왕은 물건을 팔지 않습니다. 자주 사는 생식품 중에서, 최근 시세와
          유통마진이 괜찮은 절약 후보만 담았습니다.
          <span className="font-semibold text-foreground/70">
            {" "}
            고춧가루·젓갈 등 가공식품과 소매 거품 종목은 제외
          </span>
          합니다.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-black/5 sm:p-4">
          {basket.map((item, idx) => (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className="nums flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-background/80"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand-dark">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{item.name}</p>
                  <CompassBadge level={item.compass} />
                </div>
                <p className="mt-0.5 text-xs text-foreground/50">
                  {item.consumerUnit} 도매 {won(item.consumerAuctionPrice)} ·
                  소매 약 {won(item.consumerRetailPrice)}
                  {" · "}
                  절약률{" "}
                  {Math.round(
                    (item.savingPerUnit /
                      Math.max(item.consumerRetailPrice, 1)) *
                      100,
                  )}
                  %
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold text-foreground/45">
                  {item.consumerUnit}당 이득
                </p>
                <p className="text-lg font-extrabold text-brand-dark">
                  {won(item.savingPerUnit)}
                </p>
                <div className="mt-1 flex justify-end">
                  <RetailGapBadge level={item.retailGap} />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <aside className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-sm">
          <p className="text-sm font-semibold text-white/80">절약 바구니란?</p>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            ‘소매−도매’ 원액이 가장 큰 목록이 아닙니다. 오늘 시세가 무난하고
            유통마진도 과도하지 않은데, 소매보다 도매 환산가가 낮아 장보면
            이득인 식품만 고릅니다.
          </p>
          <p className="nums mt-6 text-xs font-semibold text-white/70">
            상위 {basket.length}개 · 각 1단위씩이면
          </p>
          <p className="nums mt-1 text-4xl font-extrabold tracking-tight">
            약 {won(totalIfOneEach)}
          </p>
          <p className="mt-1 text-sm text-white/75">만큼의 가격 차이</p>
          <p className="mt-5 text-xs leading-relaxed text-white/65">
            * 판매·배송이 아닌 시세 안내입니다. 거품이 큰 품목은 위 ‘관망 3’을
            보세요.
          </p>
          <a
            href="#waitlist"
            className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-dark"
          >
            이런 날 알림 받기
          </a>
        </aside>
      </div>
    </section>
  );
}
