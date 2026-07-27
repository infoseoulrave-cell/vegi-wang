import { NextResponse } from "next/server";
import { getPriceFeed } from "@/lib/prices";

export const revalidate = 600;

export async function GET() {
  const feed = await getPriceFeed();
  return NextResponse.json(feed);
}
