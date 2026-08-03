import Link from "next/link";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { TodayPicks } from "@/components/TodayPicks";
import { WaitlistForm } from "@/components/WaitlistForm";
import { won } from "@/lib/format";
import { buildTodayPickGroups } from "@/lib/consumer-picks";
import { getRepositories } from "@/server/repos";
import { getServedPriceFeed } from "@/server/services/price-feed";
import type { Metadata } from "next";

export const revalidate = 600;
export const preferredRegion = "icn1";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://vegi-wang.vercel.app";

export async function generateMetadata(): Promise<Metadata> {
  const feed = await getServedPriceFeed(getRepositories());
  const groups = buildTodayPickGroups(feed.items);
  const buyNames = groups.buys
    .slice(0, 3)
    .map((p) => p.item.name)
    .join("·");
  const title = buyNames
    ? `오늘 담기 좋은 타이밍: ${buyNames} — 베지왕`
    : "오늘 장보기 타이밍 — 베지왕";
  const description = `${feed.date} 가락 경매가 기준. 최근 추세 대비 담기·관망 타이밍을 공개합니다.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE}/today` },
    openGraph: {
      title,
      description,
      url: `${SITE}/today`,
      type: "website",
      locale: "ko_KR",
      siteName: "베지왕",
    },
  };
}

export default async function TodayPage() {
  const feed = await getServedPriceFeed(getRepositories());
  const groups = buildTodayPickGroups(feed.items);
  const judgeable = feed.items.filter((i) => i.trendBasis === "series");
  const shareText = buildShareText(feed.date, groups);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24">
      <header className="flex items-center justify-between py-5">
        <Link
          href="/"
          className="text-sm font-semibold text-foreground/60 transition hover:text-brand-dark"
        >
          ← 베지왕 홈
        </Link>
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          베지왕
        </Link>
      </header>

      <section className="relative overflow-hidden bg-[#14231A] px-6 py-10 text-white sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-brand/35 blur-3xl" />
        <p className="text-xs font-bold tracking-[0.2em] text-emerald-300/90 uppercase">
          Today · {feed.date}
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
          오늘 장보기 타이밍
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
          가락 아침 경매가와 최근 추세로, 담기 좋은 품목과 관망할 품목을
          나눕니다. 추정 없이 관측된 날만 씁니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ShareLinkButton
            title="베지왕 · 오늘 장보기 타이밍"
            text={shareText}
            path="/today"
            label="카톡·SNS에 공유"
            className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 hover:text-[#14231A]"
          />
          <a
            href="#waitlist"
            className="rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20"
          >
            오픈·저가권 알림 받기
          </a>
        </div>
        {feed.auctionSource === "carried" && (
          <p className="mt-4 text-xs text-amber-200/90">
            직전 영업일 경락가 기준 (휴장·미수집일)
          </p>
        )}
      </section>

      {groups.buys.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-bold tracking-wider text-brand uppercase">
            한눈에
          </h2>
          <ul className="mt-3 space-y-2">
            {groups.buys.slice(0, 3).map((p) => (
              <li key={p.item.id} className="nums text-base sm:text-lg">
                <Link
                  href={`/items/${p.item.id}`}
                  className="font-bold text-foreground hover:text-brand-dark"
                >
                  {p.item.name}
                </Link>
                <span className="text-foreground/45"> · 담기 · </span>
                <span className="font-extrabold">
                  {won(p.item.consumerAuctionPrice)}
                </span>
                <span className="text-sm text-foreground/45">
                  {" "}
                  / {p.item.consumerUnit}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12">
        <TodayPicks
          groups={groups}
          trackedCount={feed.items.length}
          judgeableCount={judgeable.length}
        />
      </div>

      <section
        id="waitlist"
        className="mt-16 scroll-mt-8 border border-black/8 bg-white px-6 py-10 sm:px-10"
      >
        <h2 className="text-center text-xl font-bold sm:text-2xl">
          저가권·오픈 알림을 받아보세요
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-foreground/55">
          시세 페이지는 공개 중입니다. 알림·사업자 도구는 얼리 액세스로
          먼저 엽니다.
        </p>
        <div className="mx-auto mt-6 max-w-xl">
          <WaitlistForm />
        </div>
      </section>
    </main>
  );
}

function buildShareText(
  date: string,
  groups: ReturnType<typeof buildTodayPickGroups>,
): string {
  const buys = groups.buys
    .slice(0, 3)
    .map((p) => `· ${p.item.name}`)
    .join("\n");
  const watches = groups.watches
    .slice(0, 2)
    .map((p) => `· ${p.item.name}`)
    .join("\n");
  const parts = [`[베지왕] ${date} 장보기 타이밍`];
  if (buys) parts.push(`담기\n${buys}`);
  if (watches) parts.push(`관망\n${watches}`);
  parts.push("가락 경매가 기준 · 추정 없음");
  return parts.join("\n\n");
}
