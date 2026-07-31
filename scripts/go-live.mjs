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
} finally {
  child.kill("SIGTERM");
}

process.exit(0);
