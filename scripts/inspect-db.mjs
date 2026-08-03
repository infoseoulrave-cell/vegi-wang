#!/usr/bin/env node
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
try {
  const [{ raw }] = await sql`select count(*)::int as raw from raw_auction`;
  const [{ daily }] = await sql`select count(*)::int as daily from daily_item_price`;
  const dates = await sql`
    select sale_date::text as sale_date, count(*)::int as n
    from daily_item_price
    group by 1
    order by 1
  `;
  const gap = await sql`
    select d::text as missing
    from generate_series(date '2026-07-08', date '2026-07-27', interval '1 day') d
    where extract(dow from d) <> 0
      and not exists (
        select 1 from daily_item_price dip where dip.sale_date = d::date
      )
    order by 1
  `;
  const runs = await sql`
    select sale_date::text as sale_date, status, rows_upserted,
           started_at::text as started_at
    from ingest_runs
    order by started_at desc
    limit 20
  `;
  console.log(JSON.stringify({ raw, daily, dates, missingWeekdays: gap, recentRuns: runs }, null, 2));
} catch (e) {
  console.error("DB_ERR", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
