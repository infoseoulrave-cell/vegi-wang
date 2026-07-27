import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const file = resolve(process.cwd(), "db/migrations/001_init.sql");
const sqlText = readFileSync(file, "utf8");
const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });

try {
  await sql.unsafe(sqlText);
  console.log("Applied:", file);
} finally {
  await sql.end({ timeout: 5 });
}
