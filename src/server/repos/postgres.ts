import postgres from "postgres";
import type {
  ItemMaster,
  DailyItemPrice,
  IngestRun,
  ItemBaseline,
  Market,
  RawAuctionRecord,
  WaitlistRecord,
} from "@/server/domain/models";
import type {
  AuctionRepository,
  CatalogRepository,
  IngestRunRepository,
  Repositories,
  WaitlistRepository,
} from "@/server/repos/types";
import type { ProduceCategory } from "@/lib/types";

type Sql = ReturnType<typeof postgres>;

let cached: Sql | null = null;

export function getSql(databaseUrl: string): Sql {
  if (!cached) {
    cached = postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // serverless/pgbouncer 호환
      ssl: "require", // Supabase / managed Postgres
    });
  }
  return cached;
}

export async function closeSql(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = null;
  }
}

/**
 * 원/kg → 거래단위 가격 역산. 원문 호환 컬럼(avg_price 등)을 채우기 위한 것으로,
 * 서빙은 _per_kg 컬럼만 읽는다. unitKg를 모르면 원/kg를 그대로 둔다.
 */
function unitPrice(perKg: number, unitKg: number | null): number {
  return unitKg && unitKg > 0 ? Math.round(perKg * unitKg) : perKg;
}

class PgAuctionRepo implements AuctionRepository {
  constructor(private sql: Sql) {}

  /**
   * 원천 행 벌크 upsert.
   *
   * 예전에는 한 행씩 INSERT를 돌렸다. 하루치가 수천 행이라 도쿄 리전
   * Postgres로 수천 번 왕복이 생겼고, 실제로 7/31 수집이 3,968행에서
   * 300초 한도에 걸려 죽었다(조회 자체는 8초면 끝난다).
   * 청크 단위 다중행 INSERT로 왕복 횟수를 수천 → 수십으로 줄인다.
   */
  async upsertRaw(records: RawAuctionRecord[]): Promise<number> {
    if (!records.length) return 0;

    // 자연키가 겹치는 행이 한 배치에 들어가면
    // "ON CONFLICT DO UPDATE command cannot affect row a second time" 가 난다.
    const unique = new Map<string, RawAuctionRecord>();
    for (const r of records) unique.set(r.naturalKey, r);
    const rows = [...unique.values()];

    const CHUNK = 500;
    let n = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({
        natural_key: r.naturalKey,
        sale_date: r.saleDate,
        market_code: r.marketCode,
        corp_code: r.corpCode,
        corp_name: r.corpName,
        item_name: r.itemName,
        item_variety: r.itemVariety,
        unit: r.unit,
        grade: r.grade,
        origin: r.origin,
        qty: r.qty,
        price: r.price,
        unit_kg: r.unitKg,
        price_per_kg: r.pricePerKg,
        source: r.source,
        payload: r.payload ? this.sql.json(r.payload as never) : null,
      }));

      await this.sql`
        INSERT INTO raw_auction ${this.sql(
          chunk,
          "natural_key",
          "sale_date",
          "market_code",
          "corp_code",
          "corp_name",
          "item_name",
          "item_variety",
          "unit",
          "grade",
          "origin",
          "qty",
          "price",
          "unit_kg",
          "price_per_kg",
          "source",
          "payload",
        )}
        ON CONFLICT (natural_key) DO UPDATE SET
          price = EXCLUDED.price,
          unit_kg = EXCLUDED.unit_kg,
          price_per_kg = EXCLUDED.price_per_kg,
          qty = EXCLUDED.qty,
          payload = EXCLUDED.payload,
          ingested_at = NOW()
      `;
      n += chunk.length;
    }
    return n;
  }

  async listRawByDate(marketCode: string, saleDate: string): Promise<RawAuctionRecord[]> {
    const rows = await this.sql`
      SELECT natural_key, sale_date::text, market_code, corp_code, corp_name,
             item_name, item_variety, unit, grade, origin, qty, price,
             unit_kg, price_per_kg, source
      FROM raw_auction
      WHERE market_code = ${marketCode} AND sale_date = ${saleDate}::date
    `;
    return rows.map((r) => ({
      naturalKey: String(r.natural_key),
      saleDate: String(r.sale_date).slice(0, 10),
      marketCode: String(r.market_code),
      corpCode: r.corp_code == null ? null : String(r.corp_code),
      corpName: r.corp_name == null ? null : String(r.corp_name),
      itemName: String(r.item_name),
      itemVariety: r.item_variety == null ? null : String(r.item_variety),
      unit: r.unit == null ? null : String(r.unit),
      grade: r.grade == null ? null : String(r.grade),
      origin: r.origin == null ? null : String(r.origin),
      qty: r.qty == null ? null : Number(r.qty),
      price: Number(r.price),
      unitKg: r.unit_kg == null ? null : Number(r.unit_kg),
      pricePerKg: r.price_per_kg == null ? null : Number(r.price_per_kg),
      source: r.source as RawAuctionRecord["source"],
    }));
  }

  /** 일별 집계 벌크 upsert — upsertRaw와 같은 이유로 청크 단위로 넣는다. */
  async upsertDaily(rows: DailyItemPrice[]): Promise<number> {
    if (!rows.length) return 0;

    // (sale_date, market_code, item_name) 중복이 한 배치에 있으면 충돌한다
    const unique = new Map<string, DailyItemPrice>();
    for (const r of rows) {
      unique.set(`${r.saleDate}|${r.marketCode}|${r.itemName}`, r);
    }
    const list = [...unique.values()];

    const CHUNK = 500;
    let n = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK).map((r) => ({
        sale_date: r.saleDate,
        market_code: r.marketCode,
        item_id: r.itemId,
        item_name: r.itemName,
        avg_price: unitPrice(r.avgPricePerKg, r.unitKg),
        min_price: unitPrice(r.minPricePerKg, r.unitKg),
        max_price: unitPrice(r.maxPricePerKg, r.unitKg),
        avg_price_per_kg: r.avgPricePerKg,
        min_price_per_kg: r.minPricePerKg,
        max_price_per_kg: r.maxPricePerKg,
        unit_kg: r.unitKg,
        volume: r.volume,
        trade_count: r.tradeCount,
        unit: r.unit,
        grade: r.grade,
        origin: r.origin,
        source: r.source,
        price_status: r.priceStatus,
        as_of_date: r.asOfDate,
      }));

      await this.sql`
        INSERT INTO daily_item_price ${this.sql(
          chunk,
          "sale_date",
          "market_code",
          "item_id",
          "item_name",
          "avg_price",
          "min_price",
          "max_price",
          "avg_price_per_kg",
          "min_price_per_kg",
          "max_price_per_kg",
          "unit_kg",
          "volume",
          "trade_count",
          "unit",
          "grade",
          "origin",
          "source",
          "price_status",
          "as_of_date",
        )}
        ON CONFLICT (sale_date, market_code, item_name) DO UPDATE SET
          item_id = EXCLUDED.item_id,
          avg_price = EXCLUDED.avg_price,
          min_price = EXCLUDED.min_price,
          max_price = EXCLUDED.max_price,
          avg_price_per_kg = EXCLUDED.avg_price_per_kg,
          min_price_per_kg = EXCLUDED.min_price_per_kg,
          max_price_per_kg = EXCLUDED.max_price_per_kg,
          unit_kg = EXCLUDED.unit_kg,
          price_status = EXCLUDED.price_status,
          as_of_date = EXCLUDED.as_of_date,
          volume = EXCLUDED.volume,
          trade_count = EXCLUDED.trade_count,
          unit = EXCLUDED.unit,
          grade = EXCLUDED.grade,
          origin = EXCLUDED.origin,
          source = EXCLUDED.source,
          aggregated_at = NOW()
      `;
      n += chunk.length;
    }
    return n;
  }

  async getDaily(marketCode: string, saleDate: string): Promise<DailyItemPrice[]> {
    const rows = await this.sql`
      SELECT sale_date::text, market_code, item_id, item_name,
             avg_price_per_kg, min_price_per_kg, max_price_per_kg, unit_kg,
             volume, trade_count, unit, grade, origin, source,
             price_status, as_of_date::text
      FROM daily_item_price
      WHERE market_code = ${marketCode} AND sale_date = ${saleDate}::date
    `;
    return rows.map(mapDaily);
  }

  async getDailyByItem(
    marketCode: string,
    itemName: string,
    fromDate: string,
    toDate: string,
  ): Promise<DailyItemPrice[]> {
    const rows = await this.sql`
      SELECT sale_date::text, market_code, item_id, item_name, avg_price, min_price,
             max_price, volume, trade_count, unit, grade, origin, source
      FROM daily_item_price
      WHERE market_code = ${marketCode}
        AND item_name = ${itemName}
        AND sale_date BETWEEN ${fromDate}::date AND ${toDate}::date
      ORDER BY sale_date
    `;
    return rows.map(mapDaily);
  }

  async upsertBaselines(rows: ItemBaseline[]): Promise<number> {
    if (!rows.length) return 0;
    let n = 0;
    for (const r of rows) {
      await this.sql`
        INSERT INTO item_baseline (
          item_id, market_code, window_days, as_of_date,
          avg_price, avg_price_per_kg, sample_days, method
        ) VALUES (
          ${r.itemId}, ${r.marketCode}, ${r.windowDays}, ${r.asOfDate}::date,
          ${r.avgPricePerKg}, ${r.avgPricePerKg}, ${r.sampleDays}, ${r.method}
        )
        ON CONFLICT (item_id, market_code, window_days, as_of_date) DO UPDATE SET
          avg_price = EXCLUDED.avg_price,
          avg_price_per_kg = EXCLUDED.avg_price_per_kg,
          method = EXCLUDED.method,
          sample_days = EXCLUDED.sample_days,
          computed_at = NOW()
      `;
      n += 1;
    }
    return n;
  }

  async getBaseline(
    itemId: string,
    marketCode: string,
    asOfDate: string,
    windowDays: number,
  ): Promise<ItemBaseline | null> {
    const rows = await this.sql`
      SELECT item_id, market_code, window_days, as_of_date::text, avg_price_per_kg, sample_days, method
      FROM item_baseline
      WHERE item_id = ${itemId}
        AND market_code = ${marketCode}
        AND as_of_date = ${asOfDate}::date
        AND window_days = ${windowDays}
      LIMIT 1
    `;
    if (!rows[0]) return null;
    return mapBaseline(rows[0]);
  }

  async listBaselines(
    marketCode: string,
    asOfDate: string,
    windowDays: number,
  ): Promise<ItemBaseline[]> {
    const rows = await this.sql`
      SELECT item_id, market_code, window_days, as_of_date::text, avg_price, sample_days
      FROM item_baseline
      WHERE market_code = ${marketCode}
        AND as_of_date = ${asOfDate}::date
        AND window_days = ${windowDays}
    `;
    return rows.map(mapBaseline);
  }
}

function mapDaily(r: Record<string, unknown>): DailyItemPrice {
  return {
    saleDate: String(r.sale_date).slice(0, 10),
    marketCode: String(r.market_code),
    itemId: r.item_id == null ? null : String(r.item_id),
    itemName: String(r.item_name),
    avgPricePerKg: Number(r.avg_price_per_kg),
    minPricePerKg: Number(r.min_price_per_kg),
    maxPricePerKg: Number(r.max_price_per_kg),
    unitKg: r.unit_kg == null ? null : Number(r.unit_kg),
    volume: r.volume == null ? null : Number(r.volume),
    tradeCount: Number(r.trade_count),
    unit: r.unit == null ? null : String(r.unit),
    grade: r.grade == null ? null : String(r.grade),
    origin: r.origin == null ? null : String(r.origin),
    source: String(r.source),
    priceStatus: (r.price_status as DailyItemPrice["priceStatus"]) ?? "live",
    asOfDate: r.as_of_date == null ? null : String(r.as_of_date).slice(0, 10),
  };
}

function mapBaseline(r: Record<string, unknown>): ItemBaseline {
  return {
    itemId: String(r.item_id),
    marketCode: String(r.market_code),
    windowDays: Number(r.window_days),
    asOfDate: String(r.as_of_date).slice(0, 10),
    avgPricePerKg: Number(r.avg_price_per_kg),
    sampleDays: Number(r.sample_days),
    method: (r.method as ItemBaseline["method"]) ?? "moving_avg_30",
  };
}

class PgCatalogRepo implements CatalogRepository {
  constructor(private sql: Sql) {}

  async ensureMarket(market: Market): Promise<void> {
    await this.sql`
      INSERT INTO markets (code, name, region, is_active)
      VALUES (${market.code}, ${market.name}, ${market.region}, ${market.isActive})
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        region = EXCLUDED.region,
        is_active = EXCLUDED.is_active
    `;
  }

  async listMarkets(): Promise<Market[]> {
    const rows = await this.sql`
      SELECT code, name, region, is_active FROM markets WHERE is_active = TRUE
    `;
    return rows.map((r) => ({
      code: String(r.code),
      name: String(r.name),
      region: r.region == null ? null : String(r.region),
      isActive: Boolean(r.is_active),
    }));
  }

  async upsertItems(items: ItemMaster[]): Promise<number> {
    let n = 0;
    for (const i of items) {
      await this.sql`
        INSERT INTO items (
          id, name, category, auction_unit, weight_kg, default_grade, default_origin,
          is_active, unit_verified, source_market
        ) VALUES (
          ${i.id}, ${i.name}, ${i.category}, ${i.auctionUnit}, ${i.weightKg},
          ${i.defaultGrade}, ${i.defaultOrigin}, ${i.isActive}, ${i.unitVerified},
          ${i.sourceMarket}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          auction_unit = EXCLUDED.auction_unit,
          weight_kg = EXCLUDED.weight_kg,
          default_grade = EXCLUDED.default_grade,
          default_origin = EXCLUDED.default_origin,
          is_active = EXCLUDED.is_active,
          unit_verified = EXCLUDED.unit_verified,
          source_market = EXCLUDED.source_market,
          updated_at = NOW()
      `;
      n += 1;
    }
    return n;
  }

  async listItems(): Promise<ItemMaster[]> {
    const rows = await this.sql`
      SELECT id, name, category, auction_unit, weight_kg, default_grade, default_origin,
             is_active, unit_verified, source_market
      FROM items WHERE is_active = TRUE
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      category: String(r.category) as ProduceCategory,
      auctionUnit: String(r.auction_unit),
      weightKg: Number(r.weight_kg),
      defaultGrade: r.default_grade == null ? null : String(r.default_grade),
      defaultOrigin: r.default_origin == null ? null : String(r.default_origin),
      isActive: Boolean(r.is_active),
      unitVerified: Boolean(r.unit_verified),
      sourceMarket: (r.source_market as ItemMaster["sourceMarket"]) ?? "garak",
    }));
  }

  async findItemByName(name: string): Promise<ItemMaster | null> {
    const items = await this.listItems();
    const exact = items.find((i) => i.name === name);
    if (exact) return exact;
    const base = name.replace(/\(.*?\)/g, "").trim();
    return (
      items.find(
        (i) =>
          i.name === base ||
          i.name.includes(base) ||
          base.includes(i.name.replace(/\(.*?\)/g, "").trim()),
      ) ?? null
    );
  }
}

class PgWaitlistRepo implements WaitlistRepository {
  constructor(private sql: Sql) {}

  async add(
    email: string,
    interest: string,
  ): Promise<{ total: number; created: boolean }> {
    const key = email.toLowerCase();
    const inserted = await this.sql`
      INSERT INTO waitlist (email, interest)
      VALUES (${key}, ${interest})
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `;
    const [{ count }] = await this.sql`SELECT COUNT(*)::int AS count FROM waitlist`;
    return { total: Number(count), created: inserted.length > 0 };
  }

  async count(): Promise<number> {
    const [{ count }] = await this.sql`SELECT COUNT(*)::int AS count FROM waitlist`;
    return Number(count);
  }

  async list(limit = 100): Promise<WaitlistRecord[]> {
    const rows = await this.sql`
      SELECT email, interest, created_at
      FROM waitlist
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      email: String(r.email),
      interest: String(r.interest),
      createdAt: new Date(String(r.created_at)).toISOString(),
    }));
  }
}

class PgIngestRunRepo implements IngestRunRepository {
  constructor(private sql: Sql) {}

  async start(input: {
    saleDate: string;
    marketCode: string;
    source: string;
  }): Promise<string> {
    const [row] = await this.sql`
      INSERT INTO ingest_runs (sale_date, market_code, source, status)
      VALUES (${input.saleDate}::date, ${input.marketCode}, ${input.source}, 'running')
      RETURNING id
    `;
    return String(row.id);
  }

  async finish(
    id: string,
    patch: {
      status: IngestRun["status"];
      rowsFetched: number;
      rowsUpserted: number;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    await this.sql`
      UPDATE ingest_runs SET
        status = ${patch.status},
        rows_fetched = ${patch.rowsFetched},
        rows_upserted = ${patch.rowsUpserted},
        error_message = ${patch.errorMessage ?? null},
        finished_at = NOW()
      WHERE id = ${id}::uuid
    `;
  }

  async latest(limit = 20): Promise<IngestRun[]> {
    const rows = await this.sql`
      SELECT id, sale_date::text, market_code, source, status,
             rows_fetched, rows_upserted, error_message, started_at, finished_at
      FROM ingest_runs
      ORDER BY started_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      saleDate: String(r.sale_date).slice(0, 10),
      marketCode: String(r.market_code),
      source: String(r.source),
      status: r.status as IngestRun["status"],
      rowsFetched: Number(r.rows_fetched),
      rowsUpserted: Number(r.rows_upserted),
      errorMessage: r.error_message == null ? null : String(r.error_message),
      startedAt: new Date(String(r.started_at)).toISOString(),
      finishedAt: r.finished_at
        ? new Date(String(r.finished_at)).toISOString()
        : null,
    }));
  }
}

export function createPostgresRepositories(databaseUrl: string): Repositories {
  const sql = getSql(databaseUrl);
  return {
    auction: new PgAuctionRepo(sql),
    catalog: new PgCatalogRepo(sql),
    waitlist: new PgWaitlistRepo(sql),
    ingestRuns: new PgIngestRunRepo(sql),
    kind: "postgres",
  };
}
