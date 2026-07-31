import type {
  BaselineMethod,
  PriceSourceMarket,
  PriceStatus,
  ProduceCategory,
} from "@/lib/types";

export type AuctionIngestSource = "at" | "garak" | "fish_market" | "manual";
export type IngestRunStatus = "running" | "success" | "empty" | "failed";

export interface Market {
  code: string;
  name: string;
  region: string | null;
  isActive: boolean;
}

/** 품목 마스터 (DB `items`) — 프론트 카탈로그(@/lib/types)와 이름이 같으니 주의 */
export interface ItemMaster {
  id: string;
  name: string;
  category: ProduceCategory;
  auctionUnit: string;
  weightKg: number;
  defaultGrade: string | null;
  defaultOrigin: string | null;
  isActive: boolean;
  /** 환산중량이 실제 소스 응답과 대조 검증되었는가 */
  unitVerified: boolean;
  /** 경락가 원천 시장 — 청과는 가락, 수산은 위판장 */
  sourceMarket: PriceSourceMarket;
}

/**
 * 원천 경락 1행 (정규화 후).
 *
 * `price`/`unit`은 응답 원문 그대로 보존하고, `pricePerKg`를 파생 저장한다.
 * 원문을 남겨야 축 규칙이 바뀌었을 때 재집계할 수 있다.
 * `unitKg`가 null이면 중량 환산이 불가능한 행이라 집계에서 제외된다.
 */
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
  /** 원문 가격 (거래단위 기준) */
  price: number;
  /** 거래단량의 환산 중량(kg). 파싱 불가면 null */
  unitKg: number | null;
  /** 파생 원/kg. unitKg가 null이면 null */
  pricePerKg: number | null;
  source: AuctionIngestSource;
  payload?: Record<string, unknown> | null;
}

/** 품목×시장×일자 집계 — **모든 가격은 원/kg 축** */
export interface DailyItemPrice {
  saleDate: string;
  marketCode: string;
  itemId: string | null;
  itemName: string;
  avgPricePerKg: number;
  minPricePerKg: number;
  maxPricePerKg: number;
  volume: number | null;
  tradeCount: number;
  unit: string | null;
  /** 집계에 쓰인 대표 거래단량(kg) — 상자가 역산용 */
  unitKg: number | null;
  grade: string | null;
  origin: string | null;
  source: string;
  priceStatus: PriceStatus;
  /** carried일 때 실측 기준일 */
  asOfDate: string | null;
}

export interface ItemBaseline {
  itemId: string;
  marketCode: string;
  windowDays: number;
  asOfDate: string;
  avgPricePerKg: number;
  sampleDays: number;
  /** 어떤 근거로 산출한 기준선인지 — UI에 그대로 노출한다 */
  method: BaselineMethod;
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
