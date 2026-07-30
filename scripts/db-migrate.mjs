import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const dir = resolve(process.cwd(), "db/migrations");
// 파일명 접두 번호 순으로 전량 적용. 각 마이그레이션은 IF NOT EXISTS /
// CREATE OR REPLACE 로 작성되어 반복 실행해도 안전하다.
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (!files.length) {
  console.error("No migrations found in", dir);
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });

try {
  for (const name of files) {
    await sql.unsafe(readFileSync(resolve(dir, name), "utf8"));
    console.log("Applied:", name);
  }
  console.log(`\n${files.length}개 마이그레이션 적용 완료`);
} finally {
  await sql.end({ timeout: 5 });
}
