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

/**
 * 경락가가 어느 시장에서 왔는지.
 * 청과는 가락 도매시장, 수산은 수협 산지 위판장으로 원천이 다르다.
 * 한 화면에 섞이므로 품목마다 출처를 밝힌다.
 */
export type PriceSourceMarket = "garak" | "fish_market";

export const SOURCE_MARKET_LABEL: Record<PriceSourceMarket, string> = {
  garak: "서울 가락동 농수산물도매시장",
  fish_market: "전국 수협 위판장",
};

export const SOURCE_MARKET_SHORT: Record<PriceSourceMarket, string> = {
  garak: "가락 경락가",
  fish_market: "산지 위판가",
};

/** 기준선을 어떤 근거로 산출했는지 — UI에 그대로 노출한다 */
export type BaselineMethod =
  | "kamis_dpr7" // 자체 이력 부족 → KAMIS 평년가 (부트스트랩)
  | "moving_avg_30" // 자체 경락가 이력 30일 이동평균
  | "seasonal" // 전년 동시기 혼합
  | "none"; // 기준선 없음

/**
 * 가격 원천 식별자.
 * 비교(전일대비·동향·편차)는 **같은 원천끼리만** 유효하다.
 */
export type PriceSource = "at" | "garak" | "kamis" | "fish_market" | "db";

/** 가격 시계열 한 점 (그래프용) — **항상 원/kg 축** */
export interface PricePoint {
  /** YYYY-MM-DD (추정 포함) */
  date: string;
  /** 원/kg */
  price: number;
  /** 표시용 짧은 라벨 (예: 1주전) */
  label?: string;
  /** 이 값의 원천. 다른 원천끼리 비교하면 안 된다. */
  source?: PriceSource;
}

/**
 * 추세·편차 지표를 무엇에 근거해 냈는지.
 * - series   : 같은 원천 시계열 안에서 분위 계산 (신뢰 가능)
 * - baseline : 시계열은 없고 기준선 대비 편차만 (약함)
 * - none     : 근거 없음 → UI가 지표를 감춘다
 */
export type TrendBasis = "series" | "baseline" | "none";

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
    /** 해수부 위판 표준코드명 (mprcStdCodeNm) */
    fishMarket?: string[];
  };

  /**
   * 거래단위·환산중량이 실제 소스 응답과 대조 검증되었는가.
   * false면 서빙에서 제외한다 (scripts/verify-catalog.mjs 참고).
   */
  unitVerified: boolean;
  /** 검증 근거 또는 미검증 사유 */
  verificationNote?: string;

  /**
   * KAMIS 부류코드 override.
   *
   * category는 **소비자 관점 분류**(채소/과일/수산)이고 KAMIS 부류는 다르다.
   * 감자·고구마는 KAMIS에서 식량작물(100), 버섯류는 특용작물(300)이지만
   * 장보기 맥락에서는 채소다. 화면 분류는 category를, 조회는 이 코드를 쓴다.
   * 없으면 category에 대응하는 기본 부류코드를 쓴다.
   */
  kamisCategoryCode?: string;

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
  /**
   * [경락] 직전 영업일 경락 평균가 (원/kg).
   * **오늘값과 같은 원천일 때만** 채운다. 원천이 다르면 undefined —
   * 가락 오늘값을 KAMIS 어제값과 비교하면 시세 변동이 아니라
   * 원천 차이가 등락률로 찍힌다 (배추 실측 기준 +68%).
   */
  auctionPrevPerKg?: number;
  /**
   * [경락] 기준일 경락 최저·최고가 (원/kg).
   *
   * 대표가는 평균이지만 경매는 등급·산지·거래단량에 따라 폭이 크다.
   * 평균 하나만 보여주면 "그 값에 살 수 있다"로 읽히므로 범위를 함께 낸다.
   * 이월(carried)이거나 원천에 범위가 없으면 undefined — 평균으로 채우지 않는다.
   */
  auctionLowPerKg?: number;
  auctionHighPerKg?: number;

  /** 기준선 (원/kg) */
  auctionBaselinePerKg: number;
  /** 기준선 산출 근거 */
  baselineMethod: BaselineMethod;

  /** [소매] 소매 평균가 (원/kg). 없으면 undefined — 0으로 뭉개지 않는다 */
  retailPerKg?: number;

  /** 이 경락가가 어느 시장에서 왔는지 */
  sourceMarket: PriceSourceMarket;
  /** 오늘 경락가를 준 원천 — 비교 가능 여부 판정에 쓴다 */
  priceSource?: PriceSource;

  /**
   * 추세 지표(분위·편차) 계산에 쓸 값. **history와 같은 원천**이어야 한다.
   *
   * 표시 가격은 가장 정확한 원천(가락)에서 오지만, 시계열은 KAMIS만 있을 수
   * 있다. 그때 가락 값을 KAMIS 분포에 끼워 넣으면 원천 차이만큼 위쪽으로
   * 밀려 항상 '고가권'이 된다. 그래서 분위는 KAMIS 값으로 KAMIS 분포 안에서
   * 계산한다 — "어느 수준인가"는 분포에 대한 진술이라 원천이 일관되면 유효하다.
   *
   * 반면 등락률은 두 값의 **차이**를 주장하므로 표시 가격과 원천이 달라선
   * 안 된다. auctionPrevPerKg는 계속 엄격하게 같은 원천일 때만 채운다.
   */
  trendPerKg?: number;
  /** 추세 지표가 어느 원천 기준인지 — UI가 라벨로 밝힌다 */
  trendSource?: PriceSource;

  /** 경락가 신선도 */
  priceStatus: PriceStatus;
  /** carried일 때 실측 기준일 (YYYY-MM-DD) */
  asOfDate?: string;

  /** 최근 경락 시세 시계열 (원/kg) */
  history?: PricePoint[];
}

export interface PriceItemWithSignal extends PriceItem {
  /** 전일 대비 경락가 등락률 (%). 같은 원천 전일값이 없으면 undefined */
  changeRate?: number;
  /** 기준선 대비 편차율 (%). 근거가 없으면 undefined */
  deviationRate?: number;
  /** 지표 근거 — none이면 UI가 동향 배지를 감춘다 */
  trendBasis: TrendBasis;
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

/**
 * 피드 전체의 신선도.
 *
 * 예전에는 "live" | "sample" 둘뿐이었다. 하드코딩 더미를 전부 제거한 뒤에도
 * 이 타입이 남아, 오늘 값이 없어 이월했을 때 "sample"로 떨어졌다 —
 * 실제 데이터인데 화면에 "일부 샘플 데이터"라고 표시됐다.
 *
 * - live    : 기준일 당일 실측이 하나라도 있음
 * - carried : 전부 이월 (도매시장 휴장·정산 전). 실제 데이터다
 * - none    : 표시할 값이 없음
 */
export type FeedSource = "live" | "carried" | "none";

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
