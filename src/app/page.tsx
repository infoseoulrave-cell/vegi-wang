import Image from "next/image";
import Link from "next/link";
import { PriceBoard } from "@/components/PriceBoard";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { TodayPicks } from "@/components/TodayPicks";
import { WaitlistForm } from "@/components/WaitlistForm";
import { CATEGORY_META, categoryHref } from "@/lib/categories";
import { buildTodayPickGroups } from "@/lib/consumer-picks";
import type { ProduceCategory } from "@/lib/types";
import { getRepositories } from "@/server/repos";
import { getServedPriceFeed } from "@/server/services/price-feed";

export const revalidate = 600;
export const preferredRegion = "icn1";

const CATEGORY_TILES: ProduceCategory[] = ["채소", "과일", "수산"];

export default async function Home() {
  const feed = await getServedPriceFeed(getRepositories());
  const judgeable = feed.items.filter((i) => i.trendBasis === "series");
  const lowCount = judgeable.filter((i) => i.trendPosition === "low").length;
  const pickGroups = buildTodayPickGroups(feed.items);
  const isCarried = feed.auctionSource === "carried";
  const shareText = `[베지왕] ${feed.date} 장보기 타이밍\n담기 ${pickGroups.buys.length} · 관망 ${pickGroups.watches.length}\n가락 경매가 기준`;

  return (
    <main className="w-full">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="text-2xl" aria-hidden>
              🥬
            </span>
            <span className="text-xl font-extrabold tracking-tight">베지왕</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/today"
              className="rounded-full bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-white/25 sm:px-4"
            >
              오늘 타이밍
            </Link>
            <a
              href="#waitlist"
              className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-brand-dark shadow-sm transition hover:bg-emerald-50 sm:px-4"
            >
              알림 받기
            </a>
          </nav>
        </div>
      </header>

      {/* 풀블리드 히어로 — 브랜드 + 유입 CTA */}
      <section className="relative min-h-[100svh] w-full overflow-hidden">
        <Image
          src="/images/hero_market.png"
          alt="가락시장 새벽 농수산물"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-[var(--background)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(31,157,85,0.28),transparent_55%)]" />

        <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col justify-end px-5 pb-16 pt-28 sm:pb-24 sm:pt-32">
          <p className="mb-4 text-sm font-semibold tracking-[0.18em] text-emerald-200/90 uppercase">
            시세 공개 · 알림 준비 중
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-6xl">
            베지왕
          </h1>
          <p className="mt-4 max-w-xl text-lg font-medium leading-relaxed text-white/90 sm:text-xl">
            가락 아침 경매가로, 지금이 살 타이밍인지 알려드립니다.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70 sm:text-base">
            오늘 담기·관망 품목과 그래프는 바로 볼 수 있습니다. 저가권 알림은
            아래에서 받아 두세요.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/today"
              className="rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-dark sm:text-base"
            >
              오늘 타이밍 보기
            </Link>
            <a
              href="#today-picks"
              className="rounded-full bg-white/10 px-7 py-3.5 text-sm font-semibold text-white ring-1 ring-white/35 backdrop-blur-sm transition hover:bg-white/20 sm:text-base"
            >
              담기·관망 바로가기
            </a>
            <ShareLinkButton
              title="베지왕 · 오늘 장보기 타이밍"
              text={shareText}
              path="/today"
              label="공유"
              className="rounded-full bg-white/10 px-7 py-3.5 text-sm font-semibold text-white ring-1 ring-white/35 backdrop-blur-sm transition hover:bg-white/20 sm:text-base"
            />
          </div>
        </div>
      </section>

      {/* 유입 훅 — 히어로 직후 오늘 타이밍 */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-8 sm:pt-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wider text-brand uppercase">
              Live · {feed.date}
            </p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
              지금 볼 수 있는 타이밍
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-foreground/55">
              검색·공유로 들어온 분도 바로 판단할 수 있게, 시세와 타이밍을 먼저
              엽니다.
              {isCarried && (
                <span className="ml-2 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  직전 영업일 경락가 기준
                </span>
              )}
            </p>
          </div>
          <div className="nums flex flex-wrap gap-2 text-xs">
            <StatChip label="추적" value={`${feed.items.length}품목`} />
            <StatChip label="판정" value={`${judgeable.length}개`} />
            <StatChip label="저가권" value={`${lowCount}개`} />
            <Link
              href="/today"
              className="rounded-md bg-brand px-2.5 py-1.5 font-semibold text-white"
            >
              /today 공유용 →
            </Link>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
          {CATEGORY_TILES.map((key) => {
            const c = CATEGORY_META[key];
            return (
              <Link
                key={key}
                href={categoryHref(key)}
                className="group relative aspect-[4/3] overflow-hidden ring-1 ring-black/5"
              >
                <Image
                  src={c.img}
                  alt={c.title}
                  fill
                  sizes="(max-width: 640px) 33vw, 360px"
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                  <p className="text-base font-bold text-white sm:text-lg">
                    {c.title}
                  </p>
                  <p className="hidden text-xs text-white/75 sm:block">
                    {c.desc}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        <TodayPicks
          groups={pickGroups}
          trackedCount={feed.items.length}
          judgeableCount={judgeable.length}
        />

        <div id="board" className="mt-14 scroll-mt-6">
          <div className="mb-5">
            <h2 className="text-2xl font-bold">경매가 · 최근 동향 그래프</h2>
            <p className="mt-1 text-sm text-foreground/50">
              {feed.market} · 소비자 단위로 번역
            </p>
          </div>
          <PriceBoard items={feed.items} />
        </div>
      </section>

      {/* 가치 — 유입 후 이해 */}
      <section className="mx-auto mt-16 grid w-full max-w-6xl gap-10 px-5 sm:grid-cols-3 sm:gap-8">
        <Value
          title="살 시점 당기기·미루기"
          desc="분위와 추세로 ‘담기 좋은 날 / 관망할 날’을 나눕니다."
        />
        <Value
          title="소비자 단위로 번역"
          desc="상자·근 단위 경매가를 1개·1포기·kg 기준으로 풉니다."
        />
        <Value
          title="보고 → 공유 → 알림"
          desc="시세 페이지를 먼저 열고, 필요할 때 알림·거래를 붙입니다."
        />
      </section>

      {/* 대기자 — 전환 */}
      <section
        id="waitlist"
        className="mx-auto mt-20 w-full max-w-6xl scroll-mt-8 px-5 pb-4"
      >
        <div className="border border-black/8 bg-white px-6 py-10 sm:px-12 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold tracking-[0.18em] text-brand uppercase">
              Alerts
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              저가권·오픈 알림 남기기
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground/55 sm:text-base">
              시세는 지금 볼 수 있습니다. 푸시·이메일 알림과 사업자 도구는
              준비되는 대로 먼저 보냅니다.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-2xl">
            <WaitlistForm />
          </div>
        </div>
      </section>

      <footer className="mx-auto mt-12 w-full max-w-6xl border-t border-black/5 px-5 py-10 text-center">
        <p className="text-sm font-semibold text-foreground/65">
          베지왕 · 가락 시세 기반 농식품 의사결정 플랫폼
        </p>
        <p className="mt-1.5 text-xs text-foreground/40">
          데이터 출처: 가락시장 경락가(서울시농수산식품공사) · 동향·소매 참고(KAMIS)
        </p>
        <nav className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs">
          <Link
            href="/today"
            className="font-medium text-foreground/55 underline underline-offset-2 hover:text-brand"
          >
            오늘 타이밍
          </Link>
          <Link
            href="/policy"
            className="font-medium text-foreground/55 underline underline-offset-2 hover:text-brand"
          >
            가격 공개 원칙
          </Link>
          <Link
            href="/privacy"
            className="font-medium text-foreground/55 underline underline-offset-2 hover:text-brand"
          >
            개인정보처리방침
          </Link>
        </nav>
      </footer>
    </main>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-black/8">
      <span className="text-foreground/45">{label} </span>
      <span className="font-semibold text-foreground/80">{value}</span>
    </span>
  );
}

function Value({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/60">{desc}</p>
    </div>
  );
}
