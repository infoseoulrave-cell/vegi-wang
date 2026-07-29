import { describe, expect, it } from "vitest";
import {
  latestDailyPrice,
  normalizeKamisPriceToPerKg,
  parseKamisRows,
  pickPreferredRows,
} from "./kamis";

// dailyPriceByCategoryList JSON 응답을 본뜬 대표 페이로드
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
  it("item 배열에서 품목명/당일가(dpr1)/평년가(dpr7)를 추출한다", () => {
    const rows = parseKamisRows(SAMPLE_JSON);
    expect(rows).toHaveLength(2); // '평균' 행은 제외
    expect(rows[0]).toEqual({
      itemName: "사과",
      rank: "상품",
      unit: "1kg",
      today: 5800,
      normalYear: 6700,
    });
    expect(rows[1]).toEqual({
      itemName: "배추",
      rank: "상품",
      unit: "1kg",
      today: 980,
      normalYear: 1260,
    });
  });

  it("item이 단일 객체로 와도 처리한다", () => {
    const single = {
      data: {
        item: {
          item_name: "무",
          rank: "상품",
          unit: "1개",
          dpr1: "1,800",
          dpr7: "1,500",
        },
      },
    };
    const rows = parseKamisRows(single);
    expect(rows).toEqual([
      {
        itemName: "무",
        rank: "상품",
        unit: "1개",
        today: 1800,
        normalYear: 1500,
      },
    ]);
  });

  it("빈/오류 응답에는 빈 배열을 반환한다", () => {
    expect(parseKamisRows({})).toEqual([]);
    expect(parseKamisRows(null)).toEqual([]);
    expect(parseKamisRows({ data: { error_code: "900" } })).toEqual([]);
  });

  it("dpr1이 '-'이면 dpr2~dpr6 중 최근 유효가를 쓴다", () => {
    const rows = parseKamisRows({
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
    });
    expect(rows[0]?.today).toBe(3540);
    expect(rows[0]?.normalYear).toBe(4549);
  });
});

describe("latestDailyPrice / normalizeKamisPriceToPerKg", () => {
  it("latestDailyPrice는 첫 유효 dpr를 반환한다", () => {
    expect(latestDailyPrice({ dpr1: "-", dpr2: "1,200" })).toBe(1200);
    expect(latestDailyPrice({ dpr1: "-", dpr2: "-", dpr3: "-" })).toBe(0);
  });

  it("kg 단위와 포기 힌트로 원/kg 환산한다", () => {
    expect(normalizeKamisPriceToPerKg(10000, "10kg 상자")).toBe(1000);
    expect(normalizeKamisPriceToPerKg(3300, "1포기", 3.3)).toBe(1000);
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
      },
      {
        itemName: "배추",
        rank: "상품",
        unit: "1포기",
        today: 3540,
        normalYear: 4549,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.today).toBe(3540);
  });
});
