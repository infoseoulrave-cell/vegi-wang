#!/usr/bin/env node
/**
 * Supabase 연결 후 마이그레이션 + 수집 job 실가동.
 * 사용: node --env-file=.env.local ./scripts/go-live.mjs
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
const cronSecret = process.env.CRON_SECRET?.trim();

if (!url) {
  console.error(`
DATABASE_URL 이 없습니다.

1) Supabase Dashboard → Project Settings → Database
2) Connection string (URI) 복사 — Session mode 권장
   예: postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
3) .env.local 에 DATABASE_URL=... 저장 후 다시 실행
`);
  process.exit(1);
}

if (!cronSecret) {
  console.error("CRON_SECRET 이 없습니다. .env.local 에 설정하세요.");
  process.exit(1);
}

console.log("→ migrate");
// 001만 적용하던 버그 수정 — 파일명 순으로 전량 적용한다.
// 각 마이그레이션은 IF NOT EXISTS / CREATE OR REPLACE 라 반복 실행해도 안전하다.
const migrationsDir = resolve(process.cwd(), "db/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
try {
  for (const name of migrations) {
    await sql.unsafe(readFileSync(resolve(migrationsDir, name), "utf8"));
    console.log(`  applied ${name}`);
  }
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM markets`;
  const [{ items }] = await sql`SELECT COUNT(*)::int AS items FROM items`;
  console.log(
    `✓ schema applied (${migrations.length}개 마이그레이션, markets=${count}, items=${items})`,
  );
} finally {
  await sql.end({ timeout: 5 });
}

const port = process.env.PORT || "3000";
console.log(`→ next start :${port}`);
const child = spawn("npx", ["next", "start", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});

function waitReady(ms = 30000) {
  return new Promise((resolveReady, reject) => {
    const t0 = Date.now();
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) {
          clearInterval(timer);
          resolveReady(await res.json());
        }
      } catch {
        if (Date.now() - t0 > ms) {
          clearInterval(timer);
          reject(new Error("server did not become ready"));
        }
      }
    }, 500);
  });
}

let health;
try {
  health = await waitReady();
  console.log("✓ health", {
    storage: health.storage,
    databaseConfigured: health.databaseConfigured,
    auctionSourcePreference: health.auctionSourcePreference,
  });

  console.log("→ ingest");
  const ingestRes = await fetch(`http://127.0.0.1:${port}/api/cron/ingest`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await ingestRes.json().catch(() => ({}));
  console.log(`✓ ingest HTTP ${ingestRes.status}`, body);

  const pricesRes = await fetch(`http://127.0.0.1:${port}/api/prices`);
  const feed = await pricesRes.json();
  console.log("✓ prices", {
    date: feed.date,
    auctionSource: feed.auctionSource,
    itemCount: feed.items?.length,
  });

  /* ── DB 실적재 검증 ──────────────────────────────────────
   * 수집이 "성공"이라고 말해도 실제로 행이 들어갔는지는 별개다.
   * 스키마·적재량·집계·기준선을 직접 세어 확인한다.
   */
  console.log("\n→ verify");
  const v = postgres(url, { max: 1, prepare: false, ssl: "require" });
  try {
    const [{ tables }] = await v`
      SELECT COUNT(*)::int AS tables FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('markets','items','raw_auction','daily_item_price',
                           'item_baseline','daily_retail_price','waitlist','ingest_runs')`;
    const [{ markets }] = await v`SELECT COUNT(*)::int AS markets FROM markets`;
    const [{ items }] = await v`SELECT COUNT(*)::int AS items FROM items`;
    const [{ active }] = await v`SELECT COUNT(*)::int AS active FROM items WHERE is_active`;
    const [{ raw }] = await v`SELECT COUNT(*)::int AS raw FROM raw_auction`;
    const [{ perkg }] = await v`SELECT COUNT(*)::int AS perkg FROM raw_auction WHERE price_per_kg IS NOT NULL`;
    const [{ daily }] = await v`SELECT COUNT(*)::int AS daily FROM daily_item_price`;
    const [{ base }] = await v`SELECT COUNT(*)::int AS base FROM item_baseline`;
    const runs = await v`
      SELECT source, status, rows_fetched, rows_upserted, error_message
      FROM ingest_runs ORDER BY started_at DESC LIMIT 5`;

    console.log(`  스키마 테이블      ${tables}/8`);
    console.log(`  markets            ${markets}  (가락 + 위판장 = 2 기대)`);
    console.log(`  items              ${items} (서빙대상 ${active})`);
    console.log(`  raw_auction        ${raw}  (원/kg 파생 ${perkg})`);
    console.log(`  daily_item_price   ${daily}`);
    console.log(`  item_baseline      ${base}  (14일 미만이면 0이 정상)`);
    console.log("  최근 수집 기록:");
    for (const r of runs) {
      console.log(`    ${r.source.padEnd(12)} ${r.status.padEnd(8)} fetched=${r.rows_fetched} upserted=${r.rows_upserted}${r.error_message ? " — " + r.error_message : ""}`);
    }

    if (raw === 0) {
      console.log("\n⚠ raw_auction이 비었습니다. 가락/KAMIS 키가 .env.local에 없으면 정상입니다");
      console.log("  (스키마는 적용됐으니 Vercel 환경변수만 넣으면 프로덕션 Cron이 채웁니다)");
    } else if (perkg === 0) {
      console.log("\n⚠ 원/kg 파생이 0건 — 거래단위 파싱 실패. 축 점검 필요");
    } else {
      console.log(`
✓ 적재 정상 (원/kg 환산율 ${Math.round((perkg / raw) * 100)}%)`);
    }
  } finally {
    await v.end({ timeout: 5 });
  }
} finally {
  child.kill("SIGTERM");
}

process.exit(0);
