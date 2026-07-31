import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * 마이그레이션을 실제 Postgres(PGlite = Postgres WASM 빌드)에 적용해 검증한다.
 *
 * DATABASE_URL이 없으면 프로덕션 DB 없이도 스키마가 도는지 확인할 방법이
 * 없었고, 실제로 001/002는 한 번도 적용된 적이 없는 채로 커밋돼 있었다.
 * 여기서 깨지면 db:migrate도 깨진다.
 */
const MIGRATIONS_DIR = resolve(__dirname, "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function applyAll(db: PGlite): Promise<void> {
  for (const file of migrationFiles()) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    await db.exec(sql);
  }
}

describe("db migrations", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await applyAll(db);
  }, 60_000);

  it("번호 접두 순서대로 정렬된다", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files[0]).toBe("001_init.sql");
    expect([...files].sort()).toEqual(files);
  });

  it("재실행해도 안전하다 (멱등)", async () => {
    await expect(applyAll(db)).resolves.not.toThrow();
  }, 60_000);

  it("원/kg 축 컬럼이 생성된다", async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'daily_item_price'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "avg_price_per_kg",
        "min_price_per_kg",
        "max_price_per_kg",
        "unit_kg",
        "price_status",
        "as_of_date",
        "quality",
      ]),
    );
    // 원문 컬럼은 보존한다 — 축 규칙이 바뀌어도 재집계할 수 있어야 한다
    expect(names).toEqual(expect.arrayContaining(["avg_price", "unit"]));
  });

  it("raw_auction에 파생 원/kg가 있다", async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'raw_auction'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining(["unit_kg", "price_per_kg", "price", "unit"]),
    );
  });

  it("기준선에 산출 근거(method)가 있고 값이 제한된다", async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'item_baseline'`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(["avg_price_per_kg", "method"]),
    );

    await db.exec(`
      INSERT INTO items (id, name, category, auction_unit, weight_kg, unit_verified)
      VALUES ('cabbage', '배추', '채소', '10kg', 10, TRUE)
      ON CONFLICT (id) DO NOTHING;
    `);
    await expect(
      db.exec(`
        INSERT INTO item_baseline
          (item_id, market_code, window_days, as_of_date, avg_price, avg_price_per_kg, sample_days, method)
        VALUES ('cabbage', '110001', 30, '2026-07-31', 10000, 1000, 20, '지어낸값');
      `),
    ).rejects.toThrow();
  });

  it("품목 마스터에 검증 상태가 있다", async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'items'`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining([
        "unit_verified",
        "verification_note",
        "plausible_min_per_kg",
        "plausible_max_per_kg",
      ]),
    );
  });

  it("서빙 뷰는 미검증 품목과 축 미확정 행을 걸러낸다", async () => {
    await db.exec(`
      INSERT INTO items (id, name, category, auction_unit, weight_kg, unit_verified)
      VALUES ('onion', '양파', '채소', '15kg', 15, FALSE)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO daily_item_price
        (sale_date, market_code, item_id, item_name, avg_price, min_price, max_price,
         avg_price_per_kg, min_price_per_kg, max_price_per_kg, unit_kg, source)
      VALUES
        ('2026-07-31', '110001', 'cabbage', '배추', 10000, 10000, 10000, 1000, 1000, 1000, 10, 'garak'),
        ('2026-07-31', '110001', 'onion',  '양파', 18000, 18000, 18000, 1200, 1200, 1200, 15, 'garak'),
        ('2026-07-30', '110001', 'cabbage', '배추2', 9000, 9000, 9000, NULL, NULL, NULL, NULL, 'garak');
    `);

    const served = await db.query<{ item_name: string }>(
      `SELECT item_name FROM daily_item_price_served ORDER BY item_name`,
    );
    // 양파는 unit_verified=false, 배추2는 avg_price_per_kg=NULL → 제외
    expect(served.rows.map((r) => r.item_name)).toEqual(["배추"]);
  });

  it("price_status는 정해진 값만 허용한다", async () => {
    await expect(
      db.exec(`
        INSERT INTO daily_item_price
          (sale_date, market_code, item_id, item_name, avg_price, min_price, max_price,
           avg_price_per_kg, min_price_per_kg, max_price_per_kg, source, price_status)
        VALUES ('2026-07-29', '110001', 'cabbage', '배추X', 1, 1, 1, 1, 1, 1, 'garak', '대충값');
      `),
    ).rejects.toThrow();
  });

  it("수산 위판장이 별도 시장으로 시드된다", async () => {
    const m = await db.query<{ code: string; name: string }>(
      `SELECT code, name FROM markets ORDER BY code`,
    );
    expect(m.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "110001" }),
        expect.objectContaining({ code: "900001", name: "전국 수협 위판장" }),
      ]),
    );
  });

  it("원천 소스에 fish_market이 허용되고 오타는 거부된다", async () => {
    await db.exec(`
      INSERT INTO raw_auction
        (natural_key, sale_date, market_code, item_name, price, unit_kg, price_per_kg, source)
      VALUES ('fk-1', '2026-07-31', '900001', '갈치', 220000, 10, 22000, 'fish_market');
    `);
    const n = await db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM raw_auction WHERE source = 'fish_market'`,
    );
    expect(n.rows[0].c).toBe(1);

    await expect(
      db.exec(`
        INSERT INTO raw_auction
          (natural_key, sale_date, market_code, item_name, price, source)
        VALUES ('fk-2', '2026-07-31', '900001', '갈치', 1, '위판');
      `),
    ).rejects.toThrow();
  });

  it("품목이 자기 원천 시장을 들고 있다", async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'items' AND column_name = 'source_market'`,
    );
    expect(cols.rows).toHaveLength(1);

    await db.exec(`
      INSERT INTO items (id, name, category, auction_unit, weight_kg, unit_verified, source_market)
      VALUES ('hairtail', '갈치', '수산', '1kg', 1, TRUE, 'fish_market')
      ON CONFLICT (id) DO NOTHING;
    `);
    const r = await db.query<{ source_market: string }>(
      `SELECT source_market FROM items WHERE id = 'hairtail'`,
    );
    expect(r.rows[0].source_market).toBe("fish_market");

    await expect(
      db.exec(`
        INSERT INTO items (id, name, category, auction_unit, weight_kg, source_market)
        VALUES ('bogus', '테스트', '수산', '1kg', 1, '아무거나');
      `),
    ).rejects.toThrow();
  });

  /**
   * 정규식 회귀 방지.
   * 가락 UUN에는 '.16kg' '.7kg'처럼 선행 0이 없는 값이 온다.
   * '[0-9]+' 로 시작하는 패턴은 '.16kg'을 16으로 읽어 100배 오차를 낸다.
   * 실제로 프로덕션 36행이 이 버그로 잘못 환산돼 있었다.
   */
  it("선행 0이 없는 단위('.16kg')를 100배 틀리게 읽지 않는다", async () => {
    await db.exec(`
      INSERT INTO items (id, name, category, auction_unit, weight_kg, unit_verified)
      VALUES ('leafy', '기타엽채', '채소', '1kg', 1, TRUE)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO raw_auction
        (natural_key, sale_date, market_code, item_name, unit, price, source)
      VALUES
        ('dot-1', '2026-07-29', '110001', '기타엽채', '.16kg', 650, 'garak'),
        ('dot-2', '2026-07-29', '110001', '딸기',     '.7kg', 41500, 'garak'),
        ('dot-3', '2026-07-29', '110001', '사과',     '10kg', 31390, 'garak');
    `);

    await applyAll(db);

    const r = await db.query<{ unit: string; unit_kg: number; per_kg: number }>(
      `SELECT unit, unit_kg::float8 AS unit_kg, price_per_kg::float8 AS per_kg
       FROM raw_auction WHERE natural_key LIKE 'dot-%' ORDER BY natural_key`,
    );
    const [leafy, berry, apple] = r.rows;

    expect(leafy.unit_kg).toBeCloseTo(0.16, 5);
    expect(leafy.per_kg).toBeCloseTo(4062.5, 1);

    expect(berry.unit_kg).toBeCloseTo(0.7, 5);
    expect(berry.per_kg).toBeCloseTo(59285.71, 1);

    // 일반 단위는 그대로
    expect(apple.unit_kg).toBeCloseTo(10, 5);
    expect(apple.per_kg).toBeCloseTo(3139, 1);
  }, 60_000);

  it("표본 14일 미만 기준선은 남기지 않는다", async () => {
    await db.exec(`
      INSERT INTO items (id, name, category, auction_unit, weight_kg, unit_verified)
      VALUES ('shortspan', '표본부족', '채소', '10kg', 10, TRUE)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO item_baseline
        (item_id, market_code, window_days, as_of_date, avg_price, sample_days, method)
      VALUES ('shortspan', '110001', 30, '2026-07-29', 10000, 1, 'moving_avg_30')
      ON CONFLICT DO NOTHING;
    `);

    await applyAll(db);

    const left = await db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM item_baseline WHERE sample_days < 14`,
    );
    expect(left.rows[0].c).toBe(0);
  }, 60_000);

  it("소매가 채널 테이블과 신뢰 뷰가 존재한다", async () => {
    const t = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('daily_retail_price', 'daily_retail_price_trusted')`,
    );
    expect(t.rows).toHaveLength(2);
  });
});
