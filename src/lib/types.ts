export type ProduceCategory = "채소" | "과일" | "수산";

export type CompassLevel = "cheap" | "fair" | "expensive";

export interface PriceItem {
  /** 안정적인 식별자 (품목코드 또는 slug) */
  id: string;
  /** 품목명 (예: 배추, 사과(후지)) */
  name: string;
  category: ProduceCategory;
  /** 거래 단위 (예: 10kg, 1kg, 8kg 상자) */
  unit: string;
  /** 등급 (예: 특, 상, 중) */
  grade: string;
  /** 대표 산지 */
  origin: string;
  /** 오늘 경매 평균가 (원) */
  todayPrice: number;
  /** 전일 평균가 (원) */
  prevPrice: number;
  /** 최근 30일 평균가 (원) — 나침반의 기준값 */
  baselinePrice: number;
}

export interface PriceItemWithSignal extends PriceItem {
  /** 전일 대비 등락률 (%) */
  changeRate: number;
  /** 기준가(30일 평균) 대비 편차율 (%) */
  deviationRate: number;
  /** 나침반 신호 */
  compass: CompassLevel;
}

export interface PriceFeed {
  /** 경매 기준일 (YYYY-MM-DD) */
  date: string;
  /** 데이터 출처: 실데이터(live) 또는 샘플(sample) */
  source: "live" | "sample";
  market: string;
  items: PriceItemWithSignal[];
}
