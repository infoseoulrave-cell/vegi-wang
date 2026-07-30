import type { ProduceCategory } from "./types";

export const CATEGORY_SLUGS = {
  vegetable: "채소",
  fruit: "과일",
  seafood: "수산",
} as const satisfies Record<string, ProduceCategory>;

export type CategorySlug = keyof typeof CATEGORY_SLUGS;

export const CATEGORY_META: Record<
  ProduceCategory,
  { slug: CategorySlug; title: string; desc: string; img: string }
> = {
  채소: {
    slug: "vegetable",
    title: "채소",
    desc: "배추·양파·대파·오이 등 장보기 채소 시세",
    img: "/images/cat_vegetable.png",
  },
  과일: {
    slug: "fruit",
    title: "과일",
    desc: "사과·바나나·포도·감귤 등 장보기 과일 시세",
    img: "/images/cat_fruit.png",
  },
  수산: {
    slug: "seafood",
    title: "수산",
    desc: "고등어·오징어·새우·갈치 등 신선 수산 시세",
    img: "/images/cat_seafood.png",
  },
};

export function categoryFromSlug(
  slug: string,
): ProduceCategory | null {
  const entry = Object.entries(CATEGORY_SLUGS).find(([s]) => s === slug);
  return entry ? entry[1] : null;
}

export function categoryHref(category: ProduceCategory): string {
  return `/category/${CATEGORY_META[category].slug}`;
}
