import { describe, expect, it } from "vitest";
import {
  aggregateAtPerKg,
  atRowPerKg,
  parseAtItems,
  type AtAuctionRow,
} from "./atMarket";

/** data.go.kr 표준 래핑 (camelCase 필드 후보) */
const SAMPLE_CAMEL = {
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
    body: {
      items: {
        item: [
          {
            gdsSclsfNm: "배추",
            grdNm: "상",
            unitNm: "10kg",
            plorNm: "강원",
            delngQy: "100",
            cost: "9,800",
            whsalCd: "110001",
          },
          {
            gdsSclsfNm: "배추",
            grdNm: "상",
            unitNm: "10kg",
            plorNm: "강원",
            delngQy: "300",
            cost: "10,200",
            whsalCd: "110001",
          },
          {
            gdsSclsfNm: "사과",
            grdNm: "특",
            unitNm: "10kg",
            plorNm: "경북",
            delngQy: "50",
            cost: "58,000",
            whsalCd: "110001",
          },
          { gdsSclsfNm: "", grdNm: "상", cost: "0" }, // 잡음
        ],
      },
      totalCount: 4,
    },
  },
};

/** 농림축산식품 포털 계열 대문자 필드 (Grid 형식) */
const SAMPLE_UPPER = {
  Grid_x: {
    row: [
      {
        SALEDATE: "20260731",
        WHSALCD: "110001",
        WHSALNAME: "서울가락도매시장",
        LARGENAME: "채소류",
        MIDNAME: "배추",
        SMALLNAME: "배추",
        COST: "9800",
        QTY: "100",
        STD: "10kg",
        SANNAME: "강원",
      },
    ],
  },
};

function row(p: Partial<AtAuctionRow>): AtAuctionRow {
  return {
    itemName: "배추",
    price: 0,
    unit: "10kg",
    qty: 0,
    grade: "상",
    origin: "강원",
    marketName: "",
    marketCode: "110001",
    ...p,
  };
}

describe("parseAtItems", () => {
  it("camelCase 응답에서 품목·가격·단위·거래량을 뽑는다", () => {
    const rows = parseAtItems(SAMPLE_CAMEL);
    expect(rows).toHaveLength(3); // 빈/0 행 제외
    expect(rows[0]).toMatchObject({
      itemName: "배추",
      price: 9800,
      unit: "10kg",
      qty: 100,
      grade: "상",
      origin: "강원",
      marketCode: "110001",
    });
  });

  it("대문자 필드(Grid 형식)도 같은 구조로 읽는다", () => {
    const rows = parseAtItems(SAMPLE_UPPER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemName: "배추",
      price: 9800,
      unit: "10kg",
      qty: 100,
      origin: "강원",
      marketName: "서울가락도매시장",
    });
  });

  it("item이 단일 객체이거나 빈 응답이어도 안전하다", () => {
    const single = {
      response: {
        body: {
          items: { item: { gdsSclsfNm: "무", cost: "14200", unitNm: "20kg" } },
        },
      },
    };
    expect(parseAtItems(single)).toHaveLength(1);
    expect(parseAtItems({})).toEqual([]);
    expect(parseAtItems(null)).toEqual([]);
  });
});

/**
 * 축 회귀 테스트.
 * 예전 aggregateAtByItem은 단위를 무시하고 원문 가격을 평균냈다.
 * 10kg 상자와 20kg 상자가 한 평균에 들어가면 결과가 무의미해진다.
 */
describe("atRowPerKg — 단위로 나눈다", () => {
  it("거래단위를 kg로 읽어 원/kg를 만든다", () => {
    expect(atRowPerKg(row({ price: 9800, unit: "10kg" }))).toBe(980);
    expect(atRowPerKg(row({ price: 14200, unit: "20kg" }))).toBe(710);
    expect(atRowPerKg(row({ price: 5000, unit: "500g" }))).toBe(10000);
  });

  it("중량으로 읽을 수 없는 단위는 null — 1kg으로 가정하지 않는다", () => {
    expect(atRowPerKg(row({ price: 9800, unit: "1개" }))).toBeNull();
    expect(atRowPerKg(row({ price: 9800, unit: "" }))).toBeNull();
    expect(atRowPerKg(row({ price: 0, unit: "10kg" }))).toBeNull();
  });
});

describe("aggregateAtPerKg", () => {
  it("거래량 가중평균으로 원/kg를 낸다", () => {
    // 980원/kg × 100  +  1,020원/kg × 300  → 1,010원/kg
    const agg = aggregateAtPerKg(parseAtItems(SAMPLE_CAMEL));
    const cabbage = agg.get("배추")!;
    expect(cabbage.perKg).toBe(1010);
    expect(cabbage.sampleRows).toBe(2);
    expect(cabbage.droppedRows).toBe(0);
  });

  it("상자 크기가 달라도 원/kg 축에서 정합하다", () => {
    const agg = aggregateAtPerKg([
      row({ itemName: "무", price: 10_000, unit: "10kg", qty: 1 }),
      row({ itemName: "무", price: 20_000, unit: "20kg", qty: 1 }),
    ]);
    // 둘 다 1,000원/kg — 원문 평균(15,000)은 아무 의미가 없다
    expect(agg.get("무")?.perKg).toBe(1000);
  });

  it("거래량이 없으면 단순평균으로 떨어진다", () => {
    const agg = aggregateAtPerKg([
      row({ itemName: "무", price: 10_000, unit: "10kg" }),
      row({ itemName: "무", price: 20_000, unit: "10kg" }),
    ]);
    expect(agg.get("무")?.perKg).toBe(1500);
  });

  it("환산 불가 행은 세어서 알리되 평균에는 넣지 않는다", () => {
    const agg = aggregateAtPerKg([
      row({ itemName: "수박", price: 18_000, unit: "1개", qty: 10 }),
      row({ itemName: "수박", price: 12_000, unit: "6kg", qty: 10 }),
    ]);
    const wm = agg.get("수박")!;
    expect(wm.perKg).toBe(2000); // 12,000 ÷ 6kg
    expect(wm.sampleRows).toBe(1);
    expect(wm.droppedRows).toBe(1);
  });

  it("환산 가능한 행이 하나도 없으면 품목이 빠진다", () => {
    const agg = aggregateAtPerKg([
      row({ itemName: "수박", price: 18_000, unit: "1개", qty: 10 }),
    ]);
    expect(agg.has("수박")).toBe(false);
  });
});
