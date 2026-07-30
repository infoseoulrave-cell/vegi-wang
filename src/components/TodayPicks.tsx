import Link from "next/link";
import { CompassBadge, RetailGapBadge } from "@/components/CompassBadge";
import { signedPct, won } from "@/lib/format";
import type { TodayPick } from "@/lib/consumer-picks";

const KIND_TONE: Record<
  TodayPick["kind"],
  { bar: string; chip: string }
> = {
  buy: {
    bar: "from-emerald-600/90 to-emerald-700/80",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  wait: {
    bar: "from-rose-600/90 to-rose-700/80",
    chip: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
  bubble: {
    bar: "from-amber-600/90 to-amber-700/80",
    chip: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
};

export function TodayPicks({ picks }: { picks: TodayPick[] }) {
  if (!picks.length) return null;

  return (
    <section id="today-picks" className="mx-auto mt-12 w-full max-w-6xl scroll-mt-6 px-5">
      <div className="mb-5">
        <h2 className="text-2xl font-bold">오늘 장보기 추천 3</h2>
        <p className="mt-1 text-sm text-foreground/50">
          최근 동향 포지션과 유통 거품으로 고른 오늘의 결정 힌트
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {picks.map((p) => {
          const tone = KIND_TONE[p.kind];
          const { item } = p;
          return (
            <Link
              key={p.kind}
              href={`/items/${item.id}`}
              className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-brand/20"
            >
              <div
                className={`bg-gradient-to-r px-4 py-3 text-white ${tone.bar}`}
              >
                <p className="text-xs font-semibold opacity-90">{p.subtitle}</p>
                <p className="text-lg font-extrabold tracking-tight">{p.title}</p>
              </div>
              <div className="nums space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold">{item.name}</p>
                    <p className="mt-0.5 text-xs text-foreground/50">
                      {item.consumerUnit} · 분위{" "}
                      {Math.round(item.trendPercentile)}%
                    </p>
                  </div>
                  <CompassBadge level={item.compass} />
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-2xl font-extrabold">
                    {won(item.consumerAuctionPrice)}
                  </p>
                  <p
                    className={`text-sm font-semibold ${
                      item.changeRate < 0
                        ? "text-emerald-600"
                        : item.changeRate > 0
                          ? "text-rose-600"
                          : "text-foreground/45"
                    }`}
                  >
                    전일 {signedPct(item.changeRate)}
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-xs ring-1 ring-black/5">
                  <span className="text-foreground/60">
                    소매 약 {won(item.consumerRetailPrice)}
                  </span>
                  <RetailGapBadge level={item.retailGap} />
                </div>
                <p className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone.chip}`}>
                  상세 그래프 보기 →
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
