/*
 * 005 이전에 쌓인 daily_item_price에 median_price_per_kg를 채운다.
 * raw_auction이 그대로 남아 있으므로 가락을 다시 호출할 필요가 없다 —
 * 지나간 경락가를 다시 받을 수 없다는 제약과도 무관하게 안전하다.
 */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL.trim(), { max: 1, prepare: false, ssl: "require" });
try {
  const before = await sql`
    select count(*)::int as total,
           count(median_price_per_kg)::int as filled
    from daily_item_price`;
  console.log(`이전: ${before[0].filled}/${before[0].total} 채워짐`);

  const updated = await sql`
    UPDATE daily_item_price d
    SET median_price_per_kg = m.med
    FROM (
      SELECT sale_date, market_code, item_name,
             ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_kg)) AS med
      FROM raw_auction
      WHERE price_per_kg IS NOT NULL AND price_per_kg > 0
      GROUP BY 1, 2, 3
    ) m
    WHERE d.sale_date = m.sale_date
      AND d.market_code = m.market_code
      AND d.item_name = m.item_name
      AND m.med > 0
    RETURNING 1`;
  console.log(`갱신: ${updated.length}행`);

  const after = await sql`
    select count(*)::int as total, count(median_price_per_kg)::int as filled
    from daily_item_price`;
  console.log(`이후: ${after[0].filled}/${after[0].total} 채워짐`);

  const diff = await sql`
    select item_name,
           round(avg(avg_price_per_kg))::int as 평균,
           round(avg(median_price_per_kg))::int as 중앙값
    from daily_item_price
    where sale_date = date '2026-08-03' and median_price_per_kg is not null
    group by 1
    order by abs(avg(avg_price_per_kg) - avg(median_price_per_kg)) desc limit 12`;
  console.log("\n=== 차이가 큰 품목 (오늘) ===");
  for (const r of diff) {
    const gap = Math.round(((r.평균 - r.중앙값) / r.중앙값) * 100);
    console.log(`  ${String(r.item_name).padEnd(12)} 평균 ${String(r.평균).padStart(7)} → 중앙값 ${String(r.중앙값).padStart(7)}  (${gap > 0 ? "+" : ""}${gap}%)`);
  }
} finally { await sql.end(); }
