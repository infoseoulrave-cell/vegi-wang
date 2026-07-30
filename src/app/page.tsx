import Image from "next/image";
import { PriceBoard } from "@/components/PriceBoard";
import { WaitlistForm } from "@/components/WaitlistForm";
import { won } from "@/lib/format";
import { getRepositories } from "@/server/repos";
import { getServedPriceFeed } from "@/server/services/price-feed";

export const revalidate = 600;
export const preferredRegion = "icn1";

const CATEGORY_TILES = [
  { key: "채소", img: "/images/cat_vegetable.png", desc: "배추·시금치·마늘·당근" },
  { key: "과일", img: "/images/cat_fruit.png", desc: "사과·포도·감귤·수박" },
  { key: "수산", img: "/images/cat_seafood.png", desc: "고등어·갈치·명태·멸치" },
];

export default async function Home() {
  const feed = await getServedPriceFeed(getRepositories());
  const lowCount = feed.items.filter((i) => i.trendPosition === "low").length;
  const best = [...feed.items].sort(
    (a, b) => a.trendPercentile - b.trendPercentile,
  )[0];
  const bestSaving = [...feed.items].sort(
    (a, b) => b.savingPerUnit - a.savingPerUnit,
  )[0];
  const isSample =
    feed.auctionSource === "sample" || feed.retailSource === "sample";

  return (
    <main className="w-full">
      {/* 헤더 */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🥬</span>
          <span className="text-xl font-extrabold tracking-tight">베지왕</span>
        </div>
        <a
          href="#waitlist"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        >
          아침 시세 알림 받기
        </a>
      </header>

      {/* 히어로 (사진 기반) */}
      <section className="mx-auto w-full max-w-6xl px-5">
        <div className="relative h-[460px] w-full overflow-hidden rounded-3xl sm:h-[560px]">
          <Image
            src="/images/hero_market.png"
            alt="가락시장 새벽 농수산물"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20" />
          <div className="absolute inset-0 flex flex-col justify-center gap-5 p-7 sm:p-14">
            <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white backdrop-blur-sm ring-1 ring-white/25">
              📈 최근 시세 동향 포지션
            </span>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              가락 <span className="text-emerald-300">아침 경매가</span>와
              <br />
              <span className="text-emerald-300">가격 그래프</span>로 보는 지금
              위치
            </h1>
            <p className="max-w-xl text-base text-white/85 sm:text-lg">
              작년·평년 대비보다, 최근 동향에서 이 가격이 저가권인지 고가권인지가
              중요합니다. 1개·1포기 기준으로 번역해 그래프로 보여드립니다.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#board"
                className="rounded-full bg-brand px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-brand-dark"
              >
                오늘 시세 보기
              </a>
              <a
                href="#waitlist"
                className="rounded-full bg-white/90 px-6 py-3 font-semibold text-foreground shadow-lg transition hover:bg-white"
              >
                아침 알림 받기
              </a>
            </div>
            <div className="nums flex flex-wrap gap-2 pt-1">
              <HeroChip label="기준일" value={feed.date} />
              <HeroChip label="추적 품목" value={`${feed.items.length}개`} />
              <HeroChip label="최근 저가권" value={`${lowCount}개`} />
              {best && (
                <HeroChip
                  label="가장 낮은 분위"
                  value={`${best.name} ${Math.round(best.trendPercentile)}%`}
                />
              )}
              {bestSaving && (
                <HeroChip
                  label="절약 최대"
                  value={`${bestSaving.name} ${bestSaving.consumerUnit}당 ${won(bestSaving.savingPerUnit)}`}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 카테고리 사진 타일 */}
      <section className="mx-auto mt-10 w-full max-w-6xl px-5">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {CATEGORY_TILES.map((c) => (
            <a
              key={c.key}
              href="#board"
              className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-black/5"
            >
              <Image
                src={c.img}
                alt={c.key}
                fill
                sizes="(max-width: 640px) 33vw, 360px"
                className="object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                <p className="text-lg font-bold text-white sm:text-xl">
                  {c.key}
                </p>
                <p className="hidden text-xs text-white/80 sm:block">
                  {c.desc}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* 경매가 보드 */}
      <section
        id="board"
        className="mx-auto mt-16 w-full max-w-6xl scroll-mt-6 px-5"
      >
        <div className="mb-5">
          <h2 className="text-2xl font-bold">경매가 · 최근 동향 그래프</h2>
          <p className="mt-1 text-sm text-foreground/50">
            {feed.market} · 1개 기준 · 그래프는 최근 도매 시세 포지션
            {isSample && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                일부 샘플 데이터
              </span>
            )}
          </p>
        </div>
        <PriceBoard items={feed.items} />
      </section>

      {/* 왜 베지왕 */}
      <section className="mx-auto mt-20 grid w-full max-w-6xl gap-4 px-5 sm:grid-cols-3">
        <Feature
          icon="📈"
          title="가격 그래프 · 동향 포지션"
          desc="평년/작년 한 줄 비교 대신, 최근 시세 곡선에서 지금이 저가·중위·고가권인지 보여줍니다."
        />
        <Feature
          icon="⚖️"
          title="유통 거품 지표"
          desc="소매가가 경락가의 몇 배인지 공개. 1개(1포기·1마리)당 얼마 아끼는지까지 계산해 드립니다."
        />
        <Feature
          icon="🧺"
          title="더 많은 품목"
          desc="채소·과일·수산 카탈로그를 넓혀 아침 경매가를 소비자 단위로 번역합니다. 이력 DB가 쌓일수록 더 정확해집니다."
        />
      </section>

      {/* 대기자 등록 */}
      <section
        id="waitlist"
        className="mx-auto mt-20 w-full max-w-6xl scroll-mt-6 px-5"
      >
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 sm:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              매일 아침, 시세 나침반을 메일로 받아보세요
            </h2>
            <p className="mt-2 text-foreground/60">
              관심 품목이 &lsquo;사기 좋은 날&rsquo;이 되면 가장 먼저
              알려드립니다.
            </p>
          </div>
          <div className="mx-auto mt-6 max-w-xl">
            <WaitlistForm />
          </div>
        </div>
      </section>

      <footer className="mx-auto mt-16 w-full max-w-6xl border-t border-black/5 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-foreground/60">
          🥬 베지왕 · 농수산물 유통을 소비자 편으로
        </p>
        <p className="mt-1.5 text-xs text-foreground/40">
          데이터 출처: 가락시장 경락가(서울시농수산식품공사) · 평년가·소매가(KAMIS
          농수산물유통정보) · MVP
        </p>
      </footer>
    </main>
  );
}

function HeroChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur-sm ring-1 ring-white/20">
      <span className="text-white/60">{label} </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-3 text-lg font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">{desc}</p>
    </div>
  );
}
