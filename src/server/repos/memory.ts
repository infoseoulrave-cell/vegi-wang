import { createHash, randomUUID } from "node:crypto";
import { addDaysISO } from "@/server/domain/date";
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

/** 프로세스 전역 메모리 스토어 — DATABASE_URL 없을 때 / 테스트용 */
function store() {
  const g = globalThis as unknown as {
    __vegiwangMemory?: {
      markets: Map<string, Market>;
      items: Map<string, ItemMaster>;
      raw: Map<string, RawAuctionRecord>;
      daily: Map<string, DailyItemPrice>;
      baselines: Map<string, ItemBaseline>;
      waitlist: Map<string, WaitlistRecord>;
      ingestRuns: Map<string, IngestRun>;
    };
  };
  if (!g.__vegiwangMemory) {
    g.__vegiwangMemory = {
      markets: new Map(),
      items: new Map(),
      raw: new Map(),
      daily: new Map(),
      baselines: new Map(),
      waitlist: new Map(),
      ingestRuns: new Map(),
    };
  }
  return g.__vegiwangMemory;
}

function dailyKey(r: Pick<DailyItemPrice, "saleDate" | "marketCode" | "itemName">) {
  return `${r.saleDate}|${r.marketCode}|${r.itemName}`;
}

function baselineKey(r: Pick<ItemBaseline, "itemId" | "marketCode" | "windowDays" | "asOfDate">) {
  return `${r.itemId}|${r.marketCode}|${r.windowDays}|${r.asOfDate}`;
}

class MemoryAuctionRepo implements AuctionRepository {
  async upsertRaw(records: RawAuctionRecord[]): Promise<number> {
    const s = store();
    for (const r of records) {
      s.raw.set(r.naturalKey, r);
    }
    return records.length;
  }

  async listRawByDate(marketCode: string, saleDate: string): Promise<RawAuctionRecord[]> {
    return [...store().raw.values()].filter(
      (r) => r.marketCode === marketCode && r.saleDate === saleDate,
    );
  }

  async upsertDaily(rows: DailyItemPrice[]): Promise<number> {
    const s = store();
    for (const r of rows) s.daily.set(dailyKey(r), r);
    return rows.length;
  }

  async getDaily(marketCode: string, saleDate: string): Promise<DailyItemPrice[]> {
    return [...store().daily.values()].filter(
      (r) => r.marketCode === marketCode && r.saleDate === saleDate,
    );
  }

  async getDailyByItem(
    marketCode: string,
    itemName: string,
    fromDate: string,
    toDate: string,
  ): Promise<DailyItemPrice[]> {
    return [...store().daily.values()]
      .filter(
        (r) =>
          r.marketCode === marketCode &&
          r.itemName === itemName &&
          r.saleDate >= fromDate &&
          r.saleDate <= toDate,
      )
      .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
  }

  async upsertBaselines(rows: ItemBaseline[]): Promise<number> {
    const s = store();
    for (const r of rows) s.baselines.set(baselineKey(r), r);
    return rows.length;
  }

  async getBaseline(
    itemId: string,
    marketCode: string,
    asOfDate: string,
    windowDays: number,
  ): Promise<ItemBaseline | null> {
    return (
      store().baselines.get(
        baselineKey({ itemId, marketCode, windowDays, asOfDate }),
      ) ?? null
    );
  }

  async listBaselines(
    marketCode: string,
    asOfDate: string,
    windowDays: number,
  ): Promise<ItemBaseline[]> {
    return [...store().baselines.values()].filter(
      (b) =>
        b.marketCode === marketCode &&
        b.asOfDate === asOfDate &&
        b.windowDays === windowDays,
    );
  }
}

class MemoryCatalogRepo implements CatalogRepository {
  async ensureMarket(market: Market): Promise<void> {
    store().markets.set(market.code, market);
  }

  async listMarkets(): Promise<Market[]> {
    return [...store().markets.values()];
  }

  async upsertItems(items: ItemMaster[]): Promise<number> {
    const s = store();
    for (const i of items) s.items.set(i.id, i);
    return items.length;
  }

  async listItems(): Promise<ItemMaster[]> {
    return [...store().items.values()].filter((i) => i.isActive);
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

class MemoryWaitlistRepo implements WaitlistRepository {
  async add(
    email: string,
    interest: string,
  ): Promise<{ total: number; created: boolean }> {
    const s = store();
    const key = email.toLowerCase();
    const created = !s.waitlist.has(key);
    if (created) {
      s.waitlist.set(key, {
        email: key,
        interest,
        createdAt: new Date().toISOString(),
      });
    }
    return { total: s.waitlist.size, created };
  }

  async count(): Promise<number> {
    return store().waitlist.size;
  }

  async list(limit = 100): Promise<WaitlistRecord[]> {
    return [...store().waitlist.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

class MemoryIngestRunRepo implements IngestRunRepository {
  async start(input: {
    saleDate: string;
    marketCode: string;
    source: string;
  }): Promise<string> {
    const id = randomUUID();
    store().ingestRuns.set(id, {
      id,
      saleDate: input.saleDate,
      marketCode: input.marketCode,
      source: input.source,
      status: "running",
      rowsFetched: 0,
      rowsUpserted: 0,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    return id;
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
    const cur = store().ingestRuns.get(id);
    if (!cur) return;
    store().ingestRuns.set(id, {
      ...cur,
      ...patch,
      errorMessage: patch.errorMessage ?? null,
      finishedAt: new Date().toISOString(),
    });
  }

  async latest(limit = 20): Promise<IngestRun[]> {
    return [...store().ingestRuns.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  async recentBySaleDate(
    asOfDate: string,
    windowDays = 21,
  ): Promise<IngestRun[]> {
    const start = addDaysISO(asOfDate, -(windowDays - 1));
    return [...store().ingestRuns.values()]
      .filter((r) => r.saleDate >= start && r.saleDate <= asOfDate)
      .sort((a, b) => {
        const byDate = b.saleDate.localeCompare(a.saleDate);
        if (byDate !== 0) return byDate;
        return b.startedAt.localeCompare(a.startedAt);
      });
  }
}

/** 테스트용 — 메모리 스토어 초기화 */
export function resetMemoryStore(): void {
  const g = globalThis as unknown as { __vegiwangMemory?: undefined };
  g.__vegiwangMemory = undefined;
}

export function createMemoryRepositories(): Repositories {
  return {
    auction: new MemoryAuctionRepo(),
    catalog: new MemoryCatalogRepo(),
    waitlist: new MemoryWaitlistRepo(),
    ingestRuns: new MemoryIngestRunRepo(),
    kind: "memory",
  };
}

/** 결정적 ID 생성 (시드 안정성) */
export function stableId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}
