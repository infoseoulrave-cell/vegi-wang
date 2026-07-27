import { NextResponse } from "next/server";
import { getEnv, hasAtCredentials, hasDatabase, hasGarakCredentials, preferredAuctionSource } from "@/server/config/env";
import { getRepositories } from "@/server/repos";

export const dynamic = "force-dynamic";

/** 백엔드 헬스 — 시크릿 값은 노출하지 않음 */
export async function GET() {
  const repos = getRepositories();
  const env = getEnv();
  let waitlistTotal: number | null = null;
  try {
    waitlistTotal = await repos.waitlist.count();
  } catch {
    waitlistTotal = null;
  }

  return NextResponse.json({
    ok: true,
    storage: repos.kind,
    databaseConfigured: hasDatabase(),
    auctionSourcePreference: preferredAuctionSource(),
    credentials: {
      at: hasAtCredentials(),
      garak: hasGarakCredentials(),
      kamis: Boolean(env.kamis.key && env.kamis.id),
      cron: Boolean(env.cronSecret),
    },
    defaultMarketCode: env.defaultMarketCode,
    baselineWindowDays: env.baselineWindowDays,
    waitlistTotal,
  });
}
