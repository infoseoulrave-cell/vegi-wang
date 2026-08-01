import { NextResponse } from "next/server";
import { getEnv } from "@/server/config/env";
import { isValidDateISO } from "@/server/domain/date";
import { getRepositories } from "@/server/repos";
import { runMorningIngest } from "@/server/services/ingest";
import { assessIngest, notifyOps } from "@/server/services/ops-alert";

export const dynamic = "force-dynamic";
/*
 * 수집은 품목 수 × 법인 6곳만큼 외부 호출이 필요하다.
 * 60초로는 부족해 504가 났다 — Fluid Compute 기본 한도(300초)까지 올린다.
 */
export const maxDuration = 300;

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

  /*
   * 여기서 HTTP 상태가 중요하다. 예전엔 수집 0건도 200을 돌려줬고,
   * 그래서 Vercel Cron은 성공으로 기록했다 — 아무도 모르는 채 그날 시세가 비었다.
   * 지나간 경락가는 다시 받을 수 없으므로, 비정상은 반드시 비-2xx로 나가야 한다.
   * 다만 일요일 휴장까지 실패로 울리면 알림이 무시당하므로 하루는 삼킨다(assessIngest).
   */
  let recent: Awaited<ReturnType<typeof repos.ingestRuns.latest>> = [];
  try {
    recent = await repos.ingestRuns.latest(14);
  } catch {
    recent = [];
  }

  const health = assessIngest(
    {
      status: result.status,
      rowsUpserted: result.rowsUpserted,
      saleDate: result.saleDate,
    },
    recent,
  );

  if (health.level !== "ok") {
    await notifyOps({
      level: health.level,
      title:
        health.level === "alert"
          ? `베지왕 수집 실패 — ${result.saleDate}`
          : `베지왕 수집 0건 — ${result.saleDate}`,
      detail: health.reason,
      fields: {
        source: result.source,
        status: result.status,
        rowsFetched: result.rowsFetched,
        rowsUpserted: result.rowsUpserted,
        emptyStreak: health.emptyStreak,
        error: result.errorMessage ?? "-",
      },
    });
  }

  // alert면 Cron 실행 자체를 실패로 남긴다(Vercel 대시보드·알림이 이걸 본다)
  const status = health.level === "alert" ? 502 : 200;
  return NextResponse.json({ ...result, health }, { status });
}

export async function POST(request: Request) {
  return GET(request);
}
