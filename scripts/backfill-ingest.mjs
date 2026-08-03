#!/usr/bin/env node
/**
 * 경락가 일자 백필.
 *
 *   node --env-file=.env.local ./scripts/backfill-ingest.mjs \
 *     --from=2026-07-08 --to=2026-07-27 \
 *     --base=https://vegi-wang.vercel.app
 */
function addDaysISO(dateISO, deltaDays) {
  const anchor = new Date(`${dateISO}T12:00:00+09:00`);
  const next = new Date(anchor.getTime() + deltaDays * 86400000);
  const kst = new Date(next.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);

const from = args.from;
const to = args.to;
const base = (args.base || "http://127.0.0.1:3000").replace(/\/$/, "");
const delayMs = Number(args["delay-ms"] ?? 3000) || 3000;
const includeSun = args["include-sun"] === "true";
const dryRun = args["dry-run"] === "true";
const secret = process.env.CRON_SECRET?.trim();

if (!from || !to) {
  console.error("Usage: --from=YYYY-MM-DD --to=YYYY-MM-DD [--base=URL]");
  process.exit(1);
}
if (!dryRun && !secret) {
  console.error("CRON_SECRET 이 필요합니다.");
  process.exit(1);
}

function listDates(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) {
    const dow = new Date(`${cur}T12:00:00+09:00`).getDay();
    if (includeSun || dow !== 0) out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const dates = listDates(from, to);
console.log(`→ backfill ${dates.length}일  ${from}..${to}`);
console.log(`  base=${base} delay=${delayMs}ms`);

const summary = [];
for (const [i, date] of dates.entries()) {
  if (dryRun) {
    console.log(`  [dry] ${date}`);
    summary.push({ date, dry: true });
    continue;
  }
  const url = `${base}/api/cron/ingest?date=${date}`;
  const t0 = Date.now();
  let status = 0;
  let body = {};
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    status = res.status;
    body = await res.json().catch(() => ({}));
  } catch (e) {
    body = { error: e instanceof Error ? e.message : String(e) };
  }
  const row = {
    date,
    http: status,
    status: body.status ?? body.error ?? "?",
    source: body.source,
    rows: body.rowsUpserted ?? body.rowsFetched,
    health: body.health?.level,
    ms: Date.now() - t0,
  };
  summary.push(row);
  console.log(
    `  ${i + 1}/${dates.length} ${date} HTTP ${status} ${row.status} rows=${row.rows ?? "-"} ${row.ms}ms`,
  );
  // 성공이든 빈손이든 한도 보호를 위해 대기. 실패면 조금 더 쉼.
  if (i < dates.length - 1) {
    await sleep(row.status === "failed" || status >= 500 ? delayMs * 2 : delayMs);
  }
}

const ok = summary.filter((r) => r.status === "success").length;
const empty = summary.filter((r) => r.status === "empty").length;
const failed = summary.filter(
  (r) => r.status !== "success" && r.status !== "empty" && !r.dry,
).length;
console.log(JSON.stringify({ ok, empty, failed, summary }, null, 2));
// 데이터는 502여도 들어갈 수 있음 — rows 기준 성공을 별도로 표시
const wrote = summary.filter((r) => Number(r.rows) > 0).length;
console.log(`wrote_rows_days=${wrote}`);
if (failed > 0 && wrote === 0) process.exit(2);
