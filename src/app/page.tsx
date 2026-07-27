import { PriceBoard } from "@/components/PriceBoard";
import { WaitlistForm } from "@/components/WaitlistForm";
import { won } from "@/lib/format";
import { getPriceFeed } from "@/lib/prices";

export default async function Home() {
  const feed = await getPriceFeed();
  const cheapCount = feed.items.filter((i) => i.compass === "cheap").length;
  const best = [...feed.items].sort(
    (a, b) => a.deviationRate - b.deviationRate,
  )[0];
  const bestSaving = [...feed.items].sort(
    (a, b) => b.savingPerKg - a.savingPerKg,
  )[0];
  const isSample =
    feed.auctionSource === "sample" || feed.retailSource === "sample";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24">
      {/* 헤더 */}
      <header className="flex items-center justify-between py-6">
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

      {/* 히어로 */}
      <section className="pt-8 pb-14 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand-dark ring-1 ring-brand/20">
          🧭 오늘의 농수산물 가격 나침반
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          <span className="text-brand">가락시장 실제 경매 낙찰가</span>를
          확인해보세요
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-foreground/60">
          매일 아침 도매시장 <b>경락가</b>와 전국 <b>소매가</b>를 나란히
          비교합니다. 지금이 평년보다 싼지, 소매에 거품이 얼마나 붙었는지 한눈에
          보고 현명하게 장을 보세요.
        </p>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="오늘 기준일" value={feed.date} />
          <Stat label="사기 좋은 품목" value={`${cheapCount}개`} />
          <Stat
            label="가장 저렴(평년比)"
            value={best ? best.name : "-"}
            hint={best ? `${best.deviationRate}%` : undefined}
          />
          <Stat
            label="도매 절약 최대"
            value={bestSaving ? bestSaving.name : "-"}
            hint={bestSaving ? `kg당 ${won(bestSaving.savingPerKg)}` : undefined}
          />
        </div>
      </section>

      {/* 경매가 보드 */}
      <section id="board" className="scroll-mt-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold">오늘의 경락가 · 소매가</h2>
            <p className="mt-1 text-sm text-foreground/50">
              {feed.market} · 소매가 출처 KAMIS
              {isSample && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                  샘플 데이터 (실데이터 연동 대기 중)
                </span>
              )}
            </p>
          </div>
        </div>
        <PriceBoard items={feed.items} />
      </section>

      {/* 왜 베지왕 */}
      <section className="mt-20 grid gap-4 sm:grid-cols-3">
        <Feature
          icon="🧭"
          title="살 타이밍 나침반"
          desc="경락가를 평년(최근 30일) 시세와 비교해 '사기 좋은 날'을 신호등처럼. 시세를 몰라도 손해 보지 않게."
        />
        <Feature
          icon="⚖️"
          title="유통 거품 지표"
          desc="소매가가 경락가의 몇 배인지 그대로 공개. 도매로 사면 kg당 얼마 아끼는지까지 계산해 드립니다."
        />
        <Feature
          icon="📊"
          title="쌓이는 니즈 DB"
          desc="관심 품목·알림 신청이 소비자 수요 데이터로 축적되어, 향후 사입·판매 연결의 기반이 됩니다."
        />
      </section>

      {/* 대기자 등록 */}
      <section
        id="waitlist"
        className="mt-20 scroll-mt-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5 sm:p-10"
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            매일 아침, 시세 나침반을 메일로 받아보세요
          </h2>
          <p className="mt-2 text-foreground/60">
            관심 품목이 &lsquo;사기 좋은 날&rsquo;이 되면 가장 먼저 알려드립니다.
          </p>
        </div>
        <div className="mx-auto mt-6 max-w-xl">
          <WaitlistForm />
        </div>
      </section>

      <footer className="mt-16 border-t border-black/5 pt-8 text-center">
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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="nums rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {hint && <p className="text-xs text-emerald-600">{hint}</p>}
    </div>
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
