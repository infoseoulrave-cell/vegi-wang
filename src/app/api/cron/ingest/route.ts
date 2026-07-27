import { NextResponse } from "next/server";
import { getEnv } from "@/server/config/env";
import { isValidDateISO } from "@/server/domain/date";
import { getRepositories } from "@/server/repos";
import { runMorningIngest } from "@/server/services/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = getEnv().cronSecret;
  // CRON_SECRET 미설정 시 로컬/개발만 허용(프로덕션에서는 반드시 설정)
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

/**
 * 아침 경매가 수집 Cron.
 * Vercel: vercel.json crons → GET /api/cron/ingest (Authorization: Bearer CRON_SECRET)
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (date && !isValidDateISO(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const repos = getRepositories();
  const result = await runMorningIngest(repos, {
    saleDate: date ?? undefined,
  });

  const status = result.status === "failed" ? 502 : 200;
  return NextResponse.json(result, { status });
}

export async function POST(request: Request) {
  return GET(request);
}
