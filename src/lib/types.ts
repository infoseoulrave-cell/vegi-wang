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

/**
 * 가격의 신선도 상태.
 * - live    : 기준일 당일 실측
 * - carried : 최근 N일 이내 실측값 이월 (asOfDate를 반드시 함께 표시)
 * - missing : 실측 없음 → 노출하지 않는다
 *
 * 가락시장은 일요일·공휴일 휴장이라 결측이 구조적으로 발생한다.
 * 이월은 허용하되 언제 값인지 숨기지 않는 것이 원칙이다.
 */
export type PriceStatus = "live" | "carried" | "missing";

/** 기준선을 어떤 근거로 산출했는지 — UI에 그대로 노출한다 */
export type BaselineMethod =
  | "kamis_dpr7" // 자체 이력 부족 → KAMIS 평년가 (부트스트랩)
  | "moving_avg_30" // 자체 경락가 이력 30일 이동평균
  | "seasonal" // 전년 동시기 혼합
  | "none"; // 기준선 없음

/** 가격 시계열 한 점 (그래프용) — **항상 원/kg 축** */
export interface PricePoint {
  /** YYYY-MM-DD (추정 포함) */
  date: string;
  /** 원/kg */
  price: number;
  /** 표시용 짧은 라벨 (예: 1주전) */
  label?: string;
}

/**
 * 품목 카탈로그 항목 — **가격을 담지 않는다**.
 *
 * 예전 SAMPLE_ITEMS는 메타와 하드코딩 가격 더미를 한 객체에 담았고,
 * 라이브 조회가 실패하면 그 더미가 아무 표시 없이 실시세인 척 노출됐다.
 * 메타와 가격을 타입 수준에서 분리해 그 경로를 없앤다.
 */
export interface CatalogItem {
  /** 안정적인 식별자 (slug) */
  id: string;
  /** 품목명 (예: 배추, 사과(후지)) */
  name: string;
  category: ProduceCategory;
  /** 가락/KAMIS 조회용 대표명 (없으면 name에서 괄호 제거) */
  queryName?: string;
  /** 경매 거래 단위 표시용 (예: 10kg 그물망) */
  auctionUnit: string;
  /** 거래 단위의 환산 중량(kg) — 상자가 환산용 */
  weightKg: number;
  /** 소비자 구매 단위 라벨 (예: 1포기, 1개, 1마리, 1단, 1팩) */
  consumerUnit: string;
  /** 소비자 구매 단위 1개의 환산 중량(kg) */
  kgPerConsumerUnit: number;
  /** 등급 (예: 특, 상, 중) */
  grade: string;
  /** 대표 산지 */
  origin: string;

  /** 소스별 품목명 별칭 — 부분문자열 추측 대신 명시적으로 선언한다 */
  aliases?: {
    kamis?: string[];
    garak?: string[];
  };

  /**
   * 거래단위·환산중량이 실제 소스 응답과 대조 검증되었는가.
   * false면 서빙에서 제외한다 (scripts/verify-catalog.mjs 참고).
   */
  unitVerified: boolean;
  /** 검증 근거 또는 미검증 사유 */
  verificationNote?: string;

  /** 상식 범위 밖 값을 걸러내기 위한 원/kg 밴드 (축 정합성 게이트) */
  plausiblePerKg?: { min: number; max: number };
}

/**
 * 카탈로그 + 실측 가격. **모든 가격은 원/kg 축이다.**
 * 상자가·소비자단위가는 파생값이며 withSignal에서 곱해 만든다.
 */
export interface PriceItem extends CatalogItem {
  /** [경락] 기준일 경락 평균가 (원/kg) */
  auctionPerKg: number;
  /** [경락] 직전 영업일 경락 평균가 (원/kg) */
  auctionPrevPerKg: number;
  /** 기준선 (원/kg) */
  auctionBaselinePerKg: number;
  /** 기준선 산출 근거 */
  baselineMethod: BaselineMethod;

  /** [소매] 소매 평균가 (원/kg). 없으면 undefined — 0으로 뭉개지 않는다 */
  retailPerKg?: number;

  /** 경락가 신선도 */
  priceStatus: PriceStatus;
  /** carried일 때 실측 기준일 (YYYY-MM-DD) */
  asOfDate?: string;

  /** 최근 경락 시세 시계열 (원/kg) */
  history?: PricePoint[];
}

export interface PriceItemWithSignal extends PriceItem {
  /** 전일 대비 경락가 등락률 (%) */
  changeRate: number;
  /** 기준선 대비 편차율 (%) */
  deviationRate: number;
  /** 최근 동향 포지션 신호 (저가/중위/고가) */
  compass: CompassLevel;
  /** 최근 시세 창 분위(0~100) */
  trendPercentile: number;
  /** 최근 시세 포지션 */
  trendPosition: TrendPosition;
  /** 그래프용 소비자 단위 환산 시리즈 */
  chartSeries: PricePoint[];

  /** 거래단위(상자) 환산가 (원) — auctionPerKg × weightKg */
  auctionUnitPrice: number;

  /** 소매가 ÷ 경락가 배수. 한쪽이라도 결측이면 undefined */
  retailMultiple?: number;
  /** 유통 거품 수준. 배수가 없으면 undefined */
  retailGap?: RetailGapLevel;
  /** 소매 대신 경락가 수준으로 살 때 kg당 아끼는 금액 (원) */
  savingPerKg?: number;

  /** 소비자 단위(1개 등) 기준 도매 환산가 (원) */
  consumerAuctionPrice: number;
  /** 소비자 단위 기준 소매 환산가 (원) */
  consumerRetailPrice?: number;
  /** 소비자 단위 1개당 도매로 살 때 아끼는 금액 (원) */
  savingPerUnit?: number;

  /** 최근 동향 포지션 + 유통 지표 추천 문구 */
  recommendation: string;
}

export type FeedSource = "live" | "sample";

export interface PriceFeed {
  /** 경매 기준일 (YYYY-MM-DD) */
  date: string;
  market: string;
  /** 경락가 출처 */
  auctionSource: FeedSource;
  /** 소매가 출처 */
  retailSource: FeedSource;
  items: PriceItemWithSignal[];
  /** 축 정합성 게이트에서 거부된 품목 (운영 진단용) */
  rejected?: { name: string; reason: string }[];
}
