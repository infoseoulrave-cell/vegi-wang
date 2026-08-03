import { addDaysISO } from "@/server/domain/date";
import type { IngestRun, IngestRunStatus } from "@/server/domain/models";

/**
 * 운영 알림 — 1인 운영에서 "조용한 실패"를 막는 장치.
 *
 * 배경: 수집이 0건이어도 Cron은 HTTP 200을 돌려주고 있었다. Vercel은 성공으로 보고,
 * 아무도 모르는 채 그날 시세가 비어버린다. 지나간 날의 경락가는 다시 받을 수 없으므로
 * 이 손실만 유일하게 복구가 불가능하다.
 *
 * 그래서 판정은 두 갈래다.
 * - 예외(failed) → 휴장으로 설명되지 않는다. 언제나 알린다.
 * - 빈손(empty) → 일요일·공휴일이면 정상이다. 하루는 삼키고, 이틀 연속이면 알린다.
 *   공휴일 표를 하드코딩하지 않는 이유는, 그 표가 틀리면 알림이 거짓말을 하기 때문이다.
 *   연속 일수로 보면 달력을 몰라도 판정이 선다.
 */

export type OpsLevel = "ok" | "warn" | "alert";

export interface IngestAssessment {
  level: OpsLevel;
  /** 연속으로 수집이 비어 있는 영업일 수(같은 날 재실행은 접어서 하루로 센다) */
  emptyStreak: number;
  reason: string;
}

/** 알림 판정에 쓸 최근 sale_date 창 (백필이 최근 실행 기록을 잠식하는 오탐 방지) */
export const INGEST_ASSESS_SALE_WINDOW_DAYS = 21;

/**
 * 실행 시각이 아니라 sale_date 기준으로 최근 창만 남긴다.
 * 백필로 과거 빈손 날짜를 돌리면 startedAt 순 latest(14)가 전부 과거가 되어
 * "14일 연속 실패" 오탐이 난다 — 그 기록을 판정에서 제외한다.
 */
export function filterRunsByRecentSaleDate(
  runs: readonly IngestRun[],
  asOfDate: string,
  windowDays = INGEST_ASSESS_SALE_WINDOW_DAYS,
): IngestRun[] {
  const start = addDaysISO(asOfDate, -(windowDays - 1));
  return runs.filter((r) => r.saleDate >= start && r.saleDate <= asOfDate);
}

/** 최근 sale_date 창 안에서 가장 최신 거래일 실행을 고른다 */
export function pickLatestBySaleDate(
  runs: readonly IngestRun[],
): IngestRun | undefined {
  if (!runs.length) return undefined;
  return [...runs].sort((a, b) => {
    const byDate = b.saleDate.localeCompare(a.saleDate);
    if (byDate !== 0) return byDate;
    return (b.startedAt || "").localeCompare(a.startedAt || "");
  })[0];
}

/** 그 날짜의 수집이 실제로 데이터를 남겼는가 */
function producedRows(run: IngestRun): boolean {
  return run.status === "success" && run.rowsUpserted > 0;
}

/**
 * asOfDate부터 달력을 거슬러 올라가며 빈손인 날을 센다.
 * 같은 saleDate로 여러 번 실행됐다면 그중 하나라도 성공했으면 성공한 날로 접는다.
 * 시도 기록이 없는 날은 건너뛴다(백필 공백이 연속 실패로 읽히지 않게).
 */
export function emptyDayStreak(
  runs: readonly IngestRun[],
  asOfDate?: string,
): number {
  const byDate = new Map<string, boolean>();
  for (const run of runs) {
    const ok = producedRows(run);
    byDate.set(run.saleDate, (byDate.get(run.saleDate) ?? false) || ok);
  }

  const end =
    asOfDate ??
    [...byDate.keys()].sort().reverse()[0];
  if (!end) return 0;

  let streak = 0;
  let cursor = end;
  for (let i = 0; i < 60; i++) {
    if (byDate.has(cursor)) {
      if (byDate.get(cursor)) break;
      streak += 1;
    }
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

/**
 * 이번 실행 결과 + 최근 이력으로 심각도를 판정한다.
 * `recentRuns`에는 이번 실행이 포함돼 있어도 되고 없어도 된다(날짜로 접기 때문).
 */
export function assessIngest(
  current: {
    status: IngestRunStatus;
    rowsUpserted: number;
    saleDate: string;
  },
  recentRuns: readonly IngestRun[],
): IngestAssessment {
  const merged: IngestRun[] = [
    {
      id: "current",
      saleDate: current.saleDate,
      marketCode: "",
      source: "",
      status: current.status,
      rowsFetched: 0,
      rowsUpserted: current.rowsUpserted,
      errorMessage: null,
      startedAt: "",
      finishedAt: null,
    },
    ...recentRuns,
  ];
  // 백필 날짜를 채울 때는 그 날짜 기준으로 센다 — 오늘 휴장이 과거 성공을 502로 만들지 않는다
  const streak = emptyDayStreak(merged, current.saleDate);

  if (current.status === "failed") {
    return {
      level: "alert",
      emptyStreak: streak,
      reason: "수집이 예외로 중단됐다 — 휴장으로 설명되지 않는다",
    };
  }

  if (streak >= 2) {
    return {
      level: "alert",
      emptyStreak: streak,
      reason: `${streak}일 연속 수집 0건 — 휴장이 아니라 파이프라인 고장일 가능성이 높다`,
    };
  }

  if (streak === 1) {
    return {
      level: "warn",
      emptyStreak: streak,
      reason: "수집 0건 — 휴장일 수 있어 하루는 지켜본다",
    };
  }

  return { level: "ok", emptyStreak: 0, reason: "정상" };
}

export interface OpsAlertPayload {
  level: OpsLevel;
  title: string;
  detail: string;
  fields?: Record<string, string | number>;
}

/**
 * 알림 전송. 전송 수단이 없어도 최소한 런타임 로그에는 남긴다.
 *
 * ALERT_WEBHOOK_URL은 Discord/Slack 웹훅이나 임의의 수신 엔드포인트를 받는다.
 * 미설정이면 콘솔만 남기고 조용히 통과한다 — 알림 실패가 수집을 막으면 본말전도다.
 */
export async function notifyOps(payload: OpsAlertPayload): Promise<boolean> {
  const line = [
    `[ops:${payload.level}] ${payload.title}`,
    payload.detail,
    payload.fields
      ? Object.entries(payload.fields)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  if (payload.level === "ok") {
    console.log(line);
  } else {
    console.error(line);
  }

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Discord/Slack 둘 다 content/text를 읽는다. 원본은 payload에 담아 보낸다.
      body: JSON.stringify({
        content: line,
        text: line,
        payload,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch (err) {
    console.error(
      `[ops] 알림 전송 실패: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
