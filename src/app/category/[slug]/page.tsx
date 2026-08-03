import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceBoard } from "@/components/PriceBoard";
import {
  CATEGORY_META,
  categoryFromSlug,
  categoryHref,
  type CategorySlug,
} from "@/lib/categories";
import type { ProduceCategory } from "@/lib/types";
import { getRepositories } from "@/server/repos";
import { getServedPriceFeed } from "@/server/services/price-feed";

export const revalidate = 600;
export const preferredRegion = "icn1";

export function generateStaticParams() {
  return [
    { slug: "vegetable" },
    { slug: "fruit" },
    { slug: "seafood" },
  ] satisfies { slug: CategorySlug }[];
}

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://vegi-wang.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = categoryFromSlug(slug);
  if (!cat) return { title: "카테고리" };
  const meta = CATEGORY_META[cat];
  const title = `${meta.title} 가락 시세·타이밍`;
  const description = `${meta.desc} 가락 경매가 기준 담기·관망 타이밍.`;
  const url = `${SITE}/category/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | 베지왕`,
      description,
      url,
      type: "website",
      locale: "ko_KR",
      siteName: "베지왕",
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const feed = await getServedPriceFeed(getRepositories());
  const items = feed.items.filter((i) => i.category === category);
  const meta = CATEGORY_META[category];
  const others = (Object.keys(CATEGORY_META) as ProduceCategory[]).filter(
    (c) => c !== category,
  );

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

      <section className="relative mt-2 overflow-hidden rounded-3xl">
        <div className="relative aspect-[21/9] min-h-[160px] w-full sm:aspect-[3/1]">
          <Image
            src={meta.img}
            alt={meta.title}
            fill
            priority
            sizes="(max-width: 1152px) 100vw, 1152px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <p className="text-sm font-semibold text-white/70">카테고리</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {meta.title}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
              {meta.desc}
            </p>
            <p className="mt-3 text-xs font-medium text-white/65">
              {feed.date} 기준 · {items.length}개 품목
              {feed.auctionSource !== "none" || feed.retailSource === "live"
                ? " · 라이브 시세"
                : ""}
            </p>
          </div>
        </div>
      </section>

      <nav className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(CATEGORY_META) as ProduceCategory[]).map((c) => {
          const active = c === category;
          return (
            <Link
              key={c}
              href={categoryHref(c)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-brand text-white shadow-sm"
                  : "bg-white text-foreground/70 ring-1 ring-black/5 hover:bg-brand/5"
              }`}
            >
              {CATEGORY_META[c].title}
            </Link>
          );
        })}
        <Link
          href="/#board"
          className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-foreground/70 ring-1 ring-black/5 hover:bg-brand/5"
        >
          전체 보드
        </Link>
      </nav>

      <section className="mt-8">
        <PriceBoard items={items} lockedCategory={category} />
      </section>

      <section className="mt-10 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <p className="text-sm font-semibold text-foreground/70">다른 카테고리</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {others.map((c) => (
            <Link
              key={c}
              href={categoryHref(c)}
              className="text-sm font-bold text-brand-dark underline-offset-2 hover:underline"
            >
              {CATEGORY_META[c].title} 시세 보기 →
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
