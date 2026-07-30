export type ProduceCategory = "채소" | "과일" | "수산";

/**
 * 살 타이밍 신호 — 최근 동향 포지션과 동일 축으로 쓴다.
 * cheap=저가권 / fair=중위권 / expensive=고가권
 */
export type CompassLevel = "cheap" | "fair" | "expensive";

/** 최근 시세 창에서의 가격 포지션 */
export type TrendPosition = "low" | "mid" | "high";

/** 유통 거품 지표 (소매가 vs 경락가 배수) */
export type RetailGapLevel = "reasonable" | "normal" | "bubble";

/** 가격 시계열 한 점 (그래프용) */
export interface PricePoint {
  /** YYYY-MM-DD (추정 포함) */
  date: string;
  /** 경매 거래단위 기준 가격(원) — 카드 그래프와 동일 축 */
  price: number;
  /** 표시용 짧은 라벨 (예: 1주전) */
  label?: string;
}

export interface PriceItem {
  /** 안정적인 식별자 (품목코드 또는 slug) */
  id: string;
  /** 품목명 (예: 배추, 사과(후지)) */
  name: string;
  category: ProduceCategory;
  /** 가락/KAMIS 조회용 대표명 (없으면 name에서 괄호 제거) */
  queryName?: string;
  /** 경매 거래 단위 (예: 10kg 그물망) */
  auctionUnit: string;
  /** 거래 단위의 환산 중량(kg) — 원/kg 계산용 */
  weightKg: number;
  /** 소비자 구매 단위 라벨 (예: 1포기, 1개, 1마리, 1단, 1팩) */
  consumerUnit: string;
  /** 소비자 구매 단위 1개의 환산 중량(kg) — 1개 기준가 계산용 */
  kgPerConsumerUnit: number;
  /** 등급 (예: 특, 상, 중) */
  grade: string;
  /** 대표 산지 */
  origin: string;

  /** [가락시장] 오늘 경매 낙찰 평균가 (원 / 거래단위) */
  auctionPrice: number;
  /** [가락시장] 전일 경락 평균가 (원 / 거래단위) */
  auctionPrevPrice: number;
  /** 최근 동향 기준가(시리즈 평균 등) (원 / 거래단위) */
  auctionBaseline: number;

  /** [KAMIS] 전국 소매 평균가 (원 / kg) */
  retailPricePerKg: number;

  /** 최근 도매 시세 시계열 (그래프·포지션용) */
  history?: PricePoint[];
}

export interface PriceItemWithSignal extends PriceItem {
  /** 경락가 원/kg 환산 */
  auctionPerKg: number;
  /** 전일 대비 경락가 등락률 (%) */
  changeRate: number;
  /** 최근 동향 평균 대비 편차율 (%) */
  deviationRate: number;
  /** 최근 동향 포지션 신호 (저가/중위/고가) */
  compass: CompassLevel;
  /** 최근 시세 창 분위(0~100) */
  trendPercentile: number;
  /** 최근 시세 포지션 */
  trendPosition: TrendPosition;
  /** 그래프용 정규화 시리즈 (소비자 단위 환산가) */
  chartSeries: PricePoint[];

  /** 소매가 / 경락가(원/kg) 배수 */
  retailMultiple: number;
  /** 유통 거품 수준 */
  retailGap: RetailGapLevel;
  /** 소매 대신 경락가 수준으로 살 때 kg당 아끼는 금액 (원) */
  savingPerKg: number;

  /** 소비자 단위(1개 등) 기준 도매(경락가) 환산가 (원) */
  consumerAuctionPrice: number;
  /** 소비자 단위(1개 등) 기준 소매 환산가 (원) */
  consumerRetailPrice: number;
  /** 소비자 단위 1개당 도매로 살 때 아끼는 금액 (원) */
  savingPerUnit: number;

  /** 최근 동향 포지션 + 유통 지표 추천 문구 */
  recommendation: string;
}

export type FeedSource = "live" | "sample" | "mixed";

export interface PriceFeed {
  /** 경매 기준일 (YYYY-MM-DD) */
  date: string;
  market: string;
  /** 경락가 출처 */
  auctionSource: "live" | "sample";
  /** 소매가 출처 */
  retailSource: "live" | "sample";
  items: PriceItemWithSignal[];
}
