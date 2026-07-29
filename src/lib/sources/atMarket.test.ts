import { describe, expect, it } from "vitest";
import { aggregateAtPerKg, parseAtItems } from "./atMarket";

// getMallRltmInfo JSON 응답을 본뜬 대표 페이로드
const SAMPLE = {
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
    body: {
      items: {
        item: [
          { gdsSclsfNm: "배추", grdNm: "상", unitNm: "10kg", plorNm: "강원", cost: "9,800" },
          { gdsSclsfNm: "배추", grdNm: "상", unitNm: "10kg", plorNm: "강원", cost: "10,200" },
          { gdsSclsfNm: "사과", grdNm: "특", unitNm: "10kg", plorNm: "경북", cost: "58,000" },
          { gdsSclsfNm: "", grdNm: "상", cost: "0" }, // 잡음
        ],
      },
      totalCount: 4,
    },
  },
};

describe("parseAtItems", () => {
  it("response.body.items.item에서 품목명/경락가를 추출한다", () => {
    const rows = parseAtItems(SAMPLE);
    expect(rows).toHaveLength(3); // 빈/0 행 제외
    expect(rows[0]).toMatchObject({
      itemName: "배추",
      price: 9800,
      grade: "상",
      unit: "10kg",
      origin: "강원",
    });
    expect(rows[2].itemName).toBe("사과");
  });

  it("item이 단일 객체이거나 빈 응답이어도 안전하다", () => {
    const single = {
      response: { body: { items: { item: { gdsSclsfNm: "무", cost: "14200" } } } },
    };
    expect(parseAtItems(single)).toEqual([
      { itemName: "무", price: 14200, qty: 0, unit: "", grade: "", origin: "" },
    ]);
    expect(parseAtItems({})).toEqual([]);
    expect(parseAtItems(null)).toEqual([]);
  });
});

describe("aggregateAtPerKg", () => {
  it("거래단량(unitNm)을 원/kg로 환산해 품목별 집계", () => {
    const agg = aggregateAtPerKg(parseAtItems(SAMPLE));
    expect(agg.get("배추")).toBe(1000); // (9800/10 + 10200/10) / 2
    expect(agg.get("사과")).toBe(5800); // 58000 / 10kg
  });
});
