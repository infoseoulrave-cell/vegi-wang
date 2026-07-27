import { PriceBoard } from "@/components/PriceBoard";
import { WaitlistForm } from "@/components/WaitlistForm";
import { getPriceFeed } from "@/lib/prices";

export default async function Home() {
  const feed = await getPriceFeed();
  const cheapCount = feed.items.filter((i) => i.compass === "cheap").length;
  const best = [...feed.items].sort(
    (a, b) => a.deviationRate - b.deviationRate,
  )[0];

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
          오늘, <span className="text-brand">사기 좋은 날</span>인가요?
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-foreground/60">
          매일 아침 공영도매시장의 <b>경매가</b>를 소비자의 언어로 번역합니다.
          배추·사과·고등어… 지금이 평년보다 싼지 비싼지 한눈에 보고 장을 보세요.
        </p>

        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 gap-3">
          <Stat label="오늘 기준일" value={feed.date} />
          <Stat label="사기 좋은 품목" value={`${cheapCount}개`} />
          <Stat
            label="오늘의 추천"
            value={best ? best.name : "-"}
            hint={best ? `평년比 ${best.deviationRate}%` : undefined}
          />
        </div>
      </section>

      {/* 경매가 보드 */}
      <section id="board" className="scroll-mt-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold">오늘의 경매가</h2>
            <p className="mt-1 text-sm text-foreground/50">
              {feed.market}
              {feed.source === "sample" && (
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
          title="가격 나침반"
          desc="경매가를 평년 시세와 비교해 '사기 좋은 날'을 신호등처럼 알려줍니다. 시세를 몰라도 손해 보지 않게."
        />
        <Feature
          icon="🌅"
          title="아침 경매가 그대로"
          desc="산지→도매법인→중도매인 다단계 이전, 가장 앞단인 경매가를 매일 아침 공개합니다."
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

      <footer className="mt-16 border-t border-black/5 pt-8 text-center text-sm text-foreground/40">
        베지왕(Vegi-Wang) · 농수산물 유통을 소비자 편으로 · MVP
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
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
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
