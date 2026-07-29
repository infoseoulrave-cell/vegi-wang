import { NextResponse } from "next/server";
import { isValidDateISO } from "@/server/domain/date";
import { getRepositories } from "@/server/repos";
import { getServedPriceFeed } from "@/server/services/price-feed";

export const revalidate = 600;

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (date && !isValidDateISO(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const repos = getRepositories();
  const feed = await getServedPriceFeed(
    repos,
    date && isValidDateISO(date) ? date : undefined,
  );

  return NextResponse.json({
    date: feed.date,
    market: feed.market,
    auctionSource: feed.auctionSource,
    retailSource: feed.retailSource,
    items: feed.items,
  });
}
