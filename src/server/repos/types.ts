import type {
  CatalogItem,
  DailyItemPrice,
  IngestRun,
  IngestRunStatus,
  ItemBaseline,
  Market,
  RawAuctionRecord,
  WaitlistRecord,
} from "@/server/domain/models";

export interface AuctionRepository {
  upsertRaw(records: RawAuctionRecord[]): Promise<number>;
  listRawByDate(marketCode: string, saleDate: string): Promise<RawAuctionRecord[]>;
  upsertDaily(rows: DailyItemPrice[]): Promise<number>;
  getDaily(
    marketCode: string,
    saleDate: string,
  ): Promise<DailyItemPrice[]>;
  getDailyByItem(
    marketCode: string,
    itemName: string,
    fromDate: string,
    toDate: string,
  ): Promise<DailyItemPrice[]>;
  upsertBaselines(rows: ItemBaseline[]): Promise<number>;
  getBaseline(
    itemId: string,
    marketCode: string,
    asOfDate: string,
    windowDays: number,
  ): Promise<ItemBaseline | null>;
  listBaselines(
    marketCode: string,
    asOfDate: string,
    windowDays: number,
  ): Promise<ItemBaseline[]>;
}

export interface CatalogRepository {
  ensureMarket(market: Market): Promise<void>;
  listMarkets(): Promise<Market[]>;
  upsertItems(items: CatalogItem[]): Promise<number>;
  listItems(): Promise<CatalogItem[]>;
  findItemByName(name: string): Promise<CatalogItem | null>;
}

export interface WaitlistRepository {
  add(email: string, interest: string): Promise<{ total: number; created: boolean }>;
  count(): Promise<number>;
  list(limit?: number): Promise<WaitlistRecord[]>;
}

export interface IngestRunRepository {
  start(input: {
    saleDate: string;
    marketCode: string;
    source: string;
  }): Promise<string>;
  finish(
    id: string,
    patch: {
      status: IngestRunStatus;
      rowsFetched: number;
      rowsUpserted: number;
      errorMessage?: string | null;
    },
  ): Promise<void>;
  latest(limit?: number): Promise<IngestRun[]>;
}

export interface Repositories {
  auction: AuctionRepository;
  catalog: CatalogRepository;
  waitlist: WaitlistRepository;
  ingestRuns: IngestRunRepository;
  kind: "memory" | "postgres";
}
