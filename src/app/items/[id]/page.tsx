import Link from "next/link";
import { notFound } from "next/navigation";
import { CompassBadge, RetailGapBadge } from "@/components/CompassBadge";
import { ItemHeroImage } from "@/components/ItemHeroImage";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { categoryHref } from "@/lib/categories";
import { COMPASS_META } from "@/lib/compass";
import { signedPct, won } from "@/lib/format";
import { getCatalogItem, getItemDetail } from "@/lib/item-detail";
import { CARRY_FORWARD_DAYS } from "@/lib/prices";
import type { CatalogItem } from "@/lib/types";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const base = getCatalogItem(id);
  if (!base) return { title: "품목을 찾을 수 없습니다 — 베지왕" };
  return {
    title: `${base.name} 가격 동향 — 베지왕`,
    description: `${base.name} 가락 경매가와 최근 시세 그래프 (${base.consumerUnit} 기준).`,
  };
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="text-[11px] font-semibold text-foreground/45">{label}</p>
      <p className={`nums mt-1 text-lg font-extrabold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

/**
 * 시세는 없지만 품목은 존재하는 상태.
 * 값을 지어내지 않으면서 페이지(및 색인)를 유지한다.
 */
function NoPriceYet({ item }: { item: CatalogItem }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16">
      <Link
        href={categoryHref(item.category)}
        className="text-sm font-semibold text-brand-dark"
      >
        ← {item.category}
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{item.name}</h1>
      <p className="mt-1 text-sm text-foreground/50">
        {item.consumerUnit} 기준 · 경매 거래단위 {item.auctionUnit}
      </p>

      <div className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <p className="font-semibold">아직 오늘 시세를 확인하지 못했습니다</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/60">
          가락시장은 일요일·공휴일에 휴장합니다. 최근 {CARRY_FORWARD_DAYS}일 이내
          경락가가 없으면 추정값을 만들지 않고 이렇게 표시합니다.
          {!item.unitVerified && (
            <>
              {" "}
              이 품목은 거래단위 환산 근거가 아직 확인되지 않아 시세를 노출하지
              않습니다.
            </>
          )}
        </p>
      </div>
    </main>
  );
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const base = getCatalogItem(id);
  if (!base) notFound();

  const detail = await getItemDetail(id);
  // 카탈로그에 있는 품목이 시세만 없는 것은 "없는 페이지"가 아니다.
  // 휴장일·수집 실패로 404를 내면 색인된 URL이 사라진다 — 상태를 밝히고 유지한다.
  if (!detail) return <NoPriceYet item={base} />;

  const { item, consumerSeries, stats, source } = detail;
  const meta = COMPASS_META[item.compass];
  const up = stats.changeRate > 0;
  const down = stats.changeRate < 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24">
      <header className="flex items-center justify-between py-5">
        <Link
          href={categoryHref(item.category)}
          className="text-sm font-semibold text-foreground/60 transition hover:text-brand-dark"
        >
          ← {item.category} 시세
        </Link>
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          베지왕
        </Link>
      </header>

      <section className="mt-2 flex flex-wrap items-start gap-5">
        <ItemHeroImage id={item.id} name={item.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {item.name}
            </h1>
            <CompassBadge level={item.compass} />
          </div>
          <p className="mt-2 text-sm text-foreground/55">
            {item.origin} · {item.grade} · 경매 {item.auctionUnit}
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <p className="text-[11px] font-semibold text-brand-dark">
                {item.consumerUnit} 도매가
              </p>
              <p className="nums text-4xl font-extrabold tracking-tight">
                {won(stats.latest)}
              </p>
            </div>
            <p
              className={`nums pb-1 text-lg font-bold ${
                down
                  ? "text-emerald-600"
                  : up
                    ? "text-rose-600"
                    : "text-foreground/45"
              }`}
            >
              전일 {signedPct(stats.changeRate)}
            </p>
          </div>
          <p className="mt-2 text-sm text-foreground/55">
            {meta.hint} · 분위 {Math.round(stats.trendPercentile)}%
            <span className="ml-2 text-xs text-foreground/40">
              이력 {source.auctionHistory}
              {source.retail === "none" ? " · 소매 없음" : ""}
            </span>
          </p>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="고가" value={won(stats.high)} tone="text-rose-600" />
        <Stat label="저가" value={won(stats.low)} tone="text-emerald-600" />
        <Stat label="평균" value={won(stats.avg)} />
        <Stat
          label="전일"
          value={won(stats.prev)}
          tone={down ? "text-emerald-600" : up ? "text-rose-600" : undefined}
        />
      </section>

      <section className="mt-6">
        <PriceHistoryChart
          series={consumerSeries}
          unitLabel={item.consumerUnit}
        />
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
          <h2 className="text-sm font-bold">실제 경매 단위</h2>
          <p className="nums mt-2 text-2xl font-extrabold">
            {won(item.auctionUnitPrice)}
          </p>
          <p className="mt-1 text-xs text-foreground/50">
            {item.auctionUnit} · kg당 {won(item.auctionPerKg)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">
              소매 {item.consumerUnit} 약 {won(item.consumerRetailPrice)}
            </h2>
            <RetailGapBadge level={item.retailGap} />
          </div>
          <p className="mt-2 text-sm">
            소매의{" "}
            <span className="font-bold text-brand-dark">
              {item.retailMultiple}배
            </span>
            <span className="text-foreground/55">
              {" "}
              · {item.consumerUnit}당 {won(item.savingPerUnit)} 절약
            </span>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-foreground/60">
            {item.recommendation}
          </p>
        </div>
      </section>
    </main>
  );
}
