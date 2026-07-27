import { NextResponse } from "next/server";
import { getPriceFeed } from "@/lib/prices";

export const revalidate = 600;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  const feed = await getPriceFeed(date && DATE_RE.test(date) ? date : undefined);
  return NextResponse.json(feed);
}
