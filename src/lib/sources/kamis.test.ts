import { describe, expect, it } from "vitest";
import {
  extractKamisSeries,
  latestDailyPrice,
  normalizeKamisPriceToPerKg,
  parseKamisRows,
  pickPreferredRows,
} from "./kamis";

const SAMPLE_JSON = {
  condition: [{ p_product_cls_code: "02" }],
  data: {
    error_code: "000",
    item: [
      { item_name: "평균", dpr1: "0", dpr7: "0" },
      {
        item_name: "사과",
        rank: "상품",
        unit: "1kg",
        dpr1: "5,800",
        dpr2: "5,600",
        dpr3: "5,200",
        dpr7: "6,700",
      },
      {
        item_name: "배추",
        rank: "상품",
        unit: "1kg",
        dpr1: "980",
        dpr7: "1,260",
      },
    ],
  },
};

describe("parseKamisRows", () => {
  it("품목명/당일가/평년가와 시계열을 추출한다", () => {
    const rows = parseKamisRows(SAMPLE_JSON, "2026-07-29");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.itemName).toBe("사과");
    expect(rows[0]?.today).toBe(5800);
    expect(rows[0]?.normalYear).toBe(6700);
    expect(rows[0]?.series.length).toBeGreaterThanOrEqual(2);
    expect(rows[1]?.itemName).toBe("배추");
  });

  it("dpr1이 '-'이면 dpr2~dpr6 중 최근 유효가를 쓴다", () => {
    const rows = parseKamisRows(
      {
        data: {
          item: {
            item_name: "배추",
            rank: "상품",
            unit: "1포기",
            dpr1: "-",
            dpr2: "-",
            dpr3: "3,540",
            dpr7: "4,549",
          },
        },
      },
      "2026-07-29",
    );
    expect(rows[0]?.today).toBe(3540);
    expect(rows[0]?.series.some((p) => p.price === 3540)).toBe(true);
  });

  it("빈/오류 응답에는 빈 배열을 반환한다", () => {
    expect(parseKamisRows({})).toEqual([]);
    expect(parseKamisRows(null)).toEqual([]);
  });
});

describe("extractKamisSeries / helpers", () => {
  it("dpr 슬롯을 날짜 시리즈로 만든다", () => {
    const s = extractKamisSeries(
      { dpr1: "-", dpr2: "1,200", dpr3: "1,100", dpr7: "1,500" },
      "2026-07-29",
    );
    expect(s.map((p) => p.price)).toEqual([1100, 1200]);
  });

  it("latestDailyPrice / kg 환산", () => {
    expect(latestDailyPrice({ dpr1: "-", dpr2: "1,200" })).toBe(1200);
    expect(normalizeKamisPriceToPerKg(10000, "10kg 상자")).toBe(1000);
    expect(normalizeKamisPriceToPerKg(3300, "1포기", 3.3)).toBe(1000);
    // 10개 × 0.25kg = 2.5kg
    expect(normalizeKamisPriceToPerKg(25000, "10개", 0.25)).toBe(10000);
  });
});

describe("pickPreferredRows", () => {
  it("동일 품목이면 상품 등급을 우선한다", () => {
    const rows = pickPreferredRows([
      {
        itemName: "배추",
        rank: "중품",
        unit: "1포기",
        today: 3000,
        normalYear: 4000,
        series: [],
      },
      {
        itemName: "배추",
        rank: "상품",
        unit: "1포기",
        today: 3540,
        normalYear: 4549,
        series: [],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.today).toBe(3540);
  });
});
