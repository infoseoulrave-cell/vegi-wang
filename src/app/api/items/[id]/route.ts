import { NextResponse } from "next/server";
import { getItemDetail } from "@/lib/item-detail";
import { isValidDateISO } from "@/server/domain/date";

export const preferredRegion = "icn1";
export const revalidate = 600;
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const date = new URL(request.url).searchParams.get("date");
  if (date && !isValidDateISO(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const detail = await getItemDetail(
    id,
    date && isValidDateISO(date) ? date : undefined,
  );
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: detail.item.id,
    name: detail.item.name,
    date: detail.item.history?.at(-1)?.date,
    source: detail.source,
    stats: detail.stats,
    item: detail.item,
    consumerSeries: detail.consumerSeries,
    auctionSeries: detail.auctionSeries,
  });
}
