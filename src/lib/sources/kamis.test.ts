import { describe, expect, it } from "vitest";
import { parseKamisRows } from "./kamis";

// dailyPriceByCategoryList JSON 응답을 본뜬 대표 페이로드
const SAMPLE_JSON = {
  condition: [{ p_product_cls_code: "02" }],
  data: {
    error_code: "000",
    item: [
      { item_name: "평균", dpr1: "0", dpr7: "0" },
      { item_name: "사과", rank: "상품", unit: "1kg", dpr1: "5,800", dpr7: "6,700" },
      { item_name: "배추", rank: "상품", unit: "1kg", dpr1: "980", dpr7: "1,260" },
    ],
  },
};

describe("parseKamisRows", () => {
  it("item 배열에서 품목명/당일가(dpr1)/평년가(dpr7)를 추출한다", () => {
    const rows = parseKamisRows(SAMPLE_JSON);
    expect(rows).toHaveLength(2); // '평균' 행은 제외
    expect(rows[0]).toEqual({ itemName: "사과", today: 5800, normalYear: 6700 });
    expect(rows[1]).toEqual({ itemName: "배추", today: 980, normalYear: 1260 });
  });

  it("item이 단일 객체로 와도 처리한다", () => {
    const single = { data: { item: { item_name: "무", dpr1: "1,800", dpr7: "1,500" } } };
    const rows = parseKamisRows(single);
    expect(rows).toEqual([{ itemName: "무", today: 1800, normalYear: 1500 }]);
  });

  it("빈/오류 응답에는 빈 배열을 반환한다", () => {
    expect(parseKamisRows({})).toEqual([]);
    expect(parseKamisRows(null)).toEqual([]);
    expect(parseKamisRows({ data: { error_code: "900" } })).toEqual([]);
  });
});
