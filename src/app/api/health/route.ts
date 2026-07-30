import { NextResponse } from "next/server";
import { getEnv, hasAtCredentials, hasDatabase, hasGarakCredentials, preferredAuctionSource } from "@/server/config/env";
import { getRepositories } from "@/server/repos";
import { CATALOG_ITEMS } from "@/lib/catalog";

export const preferredRegion = "icn1";
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

  // 수집이 실제로 돌고 있는지 — DB가 붙어 있어도 Cron이 안 돌면 이력이 안 쌓인다
  let lastIngest: {
    saleDate: string;
    source: string;
    status: string;
    rowsUpserted: number;
    finishedAt: string | null;
  } | null = null;
  try {
    const runs = await repos.ingestRuns.latest(1);
    const r = runs[0];
    if (r) {
      lastIngest = {
        saleDate: r.saleDate,
        source: r.source,
        status: r.status,
        rowsUpserted: r.rowsUpserted,
        finishedAt: r.finishedAt,
      };
    }
  } catch {
    lastIngest = null;
  }

  const catalog = CATALOG_ITEMS;
  const verified = catalog.filter((i) => i.unitVerified).length;

  return NextResponse.json({
    ok: true,
    storage: repos.kind,
    databaseConfigured: hasDatabase(),
    auctionSourcePreference: preferredAuctionSource(),
    catalog: {
      total: catalog.length,
      unitVerified: verified,
      excluded: catalog.length - verified,
      report: "docs/CATALOG_VERIFICATION.md",
    },
    lastIngest,
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
