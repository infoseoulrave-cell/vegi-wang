import type { ProduceCategory } from "@/lib/types";

export type AuctionIngestSource = "at" | "garak" | "manual";
export type IngestRunStatus = "running" | "success" | "empty" | "failed";

export interface Market {
  code: string;
  name: string;
  region: string | null;
  isActive: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: ProduceCategory;
  auctionUnit: string;
  weightKg: number;
  defaultGrade: string | null;
  defaultOrigin: string | null;
  isActive: boolean;
}

/** 원천 경락 1행 (정규화 후) */
export interface RawAuctionRecord {
  naturalKey: string;
  saleDate: string; // YYYY-MM-DD
  marketCode: string;
  corpCode: string | null;
  corpName: string | null;
  itemName: string;
  itemVariety: string | null;
  unit: string | null;
  grade: string | null;
  origin: string | null;
  qty: number | null;
  price: number;
  source: AuctionIngestSource;
  payload?: Record<string, unknown> | null;
}

export interface DailyItemPrice {
  saleDate: string;
  marketCode: string;
  itemId: string | null;
  itemName: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  volume: number | null;
  tradeCount: number;
  unit: string | null;
  grade: string | null;
  origin: string | null;
  source: string;
}

export interface ItemBaseline {
  itemId: string;
  marketCode: string;
  windowDays: number;
  asOfDate: string;
  avgPrice: number;
  sampleDays: number;
}

export interface WaitlistRecord {
  email: string;
  interest: string;
  createdAt: string;
}

export interface IngestRun {
  id: string;
  saleDate: string;
  marketCode: string;
  source: string;
  status: IngestRunStatus;
  rowsFetched: number;
  rowsUpserted: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface IngestResult {
  saleDate: string;
  marketCode: string;
  source: AuctionIngestSource | "none";
  status: IngestRunStatus;
  rowsFetched: number;
  rowsUpserted: number;
  dailyUpserted: number;
  baselinesUpserted: number;
  errorMessage?: string;
}

/** 원천 행 → 자연키 (멱등 upsert용) */
export function buildNaturalKey(r: {
  marketCode: string;
  corpCode?: string | null;
  itemName: string;
  unit?: string | null;
  grade?: string | null;
  saleDate: string;
  seq?: string | number | null;
  price: number;
}): string {
  return [
    r.marketCode,
    r.corpCode ?? "",
    r.itemName,
    r.unit ?? "",
    r.grade ?? "",
    r.saleDate,
    r.seq ?? "",
    String(r.price),
  ].join("|");
}
