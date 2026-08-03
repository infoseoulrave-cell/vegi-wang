import Link from "next/link";
import { ChangeRate } from "@/components/ChangeRate";
import { CompassBadge } from "@/components/CompassBadge";
import { won } from "@/lib/format";
import type { TodayPick, TodayPickGroups } from "@/lib/consumer-picks";

const KIND_TONE: Record<
  TodayPick["kind"],
  { bar: string; chip: string }
> = {
  buy: {
    bar: "from-emerald-700 to-emerald-800",
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-700/20",
  },
  watch: {
    bar: "from-stone-700 to-stone-800",
    chip: "bg-stone-100 text-stone-700 ring-stone-500/20",
  },
};

function PickCard({ pick }: { pick: TodayPick }) {
  const tone = KIND_TONE[pick.kind];
  const { item } = pick;
  return (
    <Link
      href={`/items/${item.id}`}
      className="group overflow-hidden bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-brand/25"
    >
      <div className={`bg-gradient-to-r px-4 py-3 text-white ${tone.bar}`}>
        <p className="text-xs font-semibold opacity-90">
          {pick.rank}위 · {pick.subtitle}
        </p>
        <p className="text-lg font-extrabold tracking-tight">{pick.title}</p>
      </div>
      <div className="nums space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xl font-bold">{item.name}</p>
            <p className="mt-0.5 text-xs text-foreground/50">
              {item.consumerUnit} · 분위 {Math.round(item.trendPercentile)}%
            </p>
          </div>
          <CompassBadge level={item.compass} />
        </div>
        <div className="flex items-end justify-between">
          <p className="text-2xl font-extrabold">
            {won(item.consumerAuctionPrice)}
          </p>
          <ChangeRate value={item.changeRate} />
        </div>
        <p
          className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone.chip}`}
        >
          상세 그래프 보기 →
        </p>
      </div>
    </Link>
  );
}

function PickSection({
  id,
  title,
  description,
  picks,
}: {
  id: string;
  title: string;
  description: string;
  picks: TodayPick[];
}) {
  if (!picks.length) return null;
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-foreground/50">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {picks.map((p) => (
          <PickCard key={`${p.kind}-${p.item.id}`} pick={p} />
        ))}
      </div>
    </section>
  );
}

export function TodayPicks({
  groups,
  trackedCount = 0,
  judgeableCount = 0,
}: {
  groups: TodayPickGroups;
  /** 피드 추적 품목 수 — 판정 0종일 때 빈 상태 문구에 씀 */
  trackedCount?: number;
  judgeableCount?: number;
}) {
  const empty = !groups.buys.length && !groups.watches.length;

  if (empty) {
    return (
      <section
        id="today-picks"
        className="mb-10 rounded-2xl bg-white px-5 py-8 ring-1 ring-black/5"
      >
        <p className="text-xs font-bold tracking-wider text-brand uppercase">
          Timing
        </p>
        <h2 className="mt-2 text-xl font-bold sm:text-2xl">
          아직 타이밍을 판정할 만큼 이력이 모이지 않았습니다
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/55">
          {trackedCount > 0
            ? `${trackedCount}종 수집 중 · 최근 21일 안에 10일이 모이면 판정을 시작합니다.`
            : "경락가 이력을 모으는 중입니다. 최근 21일 안에 10일이 모이면 담기·관망 타이밍을 표시합니다."}
          {judgeableCount > 0 ? ` 현재 판정 가능 ${judgeableCount}개.` : null}
        </p>
      </section>
    );
  }

  return (
    <div id="today-picks" className="flex w-full flex-col gap-12">
      <PickSection
        id="buy-picks"
        title="오늘 담기 좋은 타이밍"
        description="최근 추세 대비 저가권에 가까운 생식품"
        picks={groups.buys}
      />
      <PickSection
        id="watch-picks"
        title="오늘 관망할 타이밍"
        description="최근 고가권이라 급하지 않다면 미루는 편이 나은 품목"
        picks={groups.watches}
      />
    </div>
  );
}
