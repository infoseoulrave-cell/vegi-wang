import { describe, expect, it } from "vitest";
import {
  aggregateBySpeciesPerKg,
  FISH_PLAUSIBLE_PER_KG,
  normalizeSaleDate,
  parseFishMarketRows,
  rowPerKg,
  type FishMarketRow,
} from "./fishMarket";

/** data.go.kr 표준 래핑 형태 */
const SAMPLE_JSON = {
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
    body: {
      numOfRows: 1000,
      pageNo: 1,
      totalCount: 3,
      items: {
        item: [
          {
            csmtDe: "20260731",
            mxtrNm: "부산공동어시장",
            csmtmktNm: "부산공동어시장",
            mprcStdCode: "0601",
            mprcStdCodeNm: "고등어",
            goodsStndrdNm: "대",
            goodsUnitNm: "상자(CS)",
            kdfshSttusNm: "신선",
            orgplceSeNm: "국산",
            csmtQy: "200",
            csmtWt: "4,000",
            csmtUntpc: "36,000",
            csmtAmount: "7,200,000",
          },
          {
            csmtDe: "20260731",
            mxtrNm: "제주어류",
            csmtmktNm: "제주위판장",
            mprcStdCode: "0602",
            mprcStdCodeNm: "갈치",
            goodsStndrdNm: "중",
            goodsUnitNm: "상자(CS)",
            kdfshSttusNm: "신선",
            orgplceSeNm: "국산",
            csmtQy: "50",
            csmtWt: "500",
            csmtUntpc: "220,000",
            csmtAmount: "11,000,000",
          },
          {
            // 냉동 — 신선 행이 있으면 제외되어야 한다
            csmtDe: "20260731",
            mxtrNm: "부산공동어시장",
            csmtmktNm: "감천위판장",
            mprcStdCode: "0601",
            mprcStdCodeNm: "고등어",
            goodsUnitNm: "상자(CS)",
            kdfshSttusNm: "냉동",
            csmtQy: "100",
            csmtWt: "2,000",
            csmtUntpc: "10,000",
            csmtAmount: "1,000,000",
          },
        ],
      },
    },
  },
};

function row(p: Partial<FishMarketRow>): FishMarketRow {
  return {
    saleDate: "2026-07-31",
    unionName: "",
    marketName: "테스트위판장",
    stdCode: "",
    itemName: "고등어",
    spec: "",
    unitName: "상자(CS)",
    condition: "신선",
    origin: "국산",
    qty: 0,
    weightKg: 0,
    unitPrice: 0,
    amount: 0,
    ...p,
  };
}

describe("normalizeSaleDate", () => {
  it("YYYYMMDD를 ISO로 바꾼다", () => {
    expect(normalizeSaleDate("20260731")).toBe("2026-07-31");
    expect(normalizeSaleDate("2026-07-31")).toBe("2026-07-31");
  });
});

describe("parseFishMarketRows", () => {
  it("래핑 깊이와 무관하게 행을 찾아 콤마 숫자를 파싱한다", () => {
    const rows = parseFishMarketRows(SAMPLE_JSON);
    expect(rows).toHaveLength(3);
    const mackerel = rows.find((r) => r.marketName === "부산공동어시장")!;
    expect(mackerel.itemName).toBe("고등어");
    expect(mackerel.weightKg).toBe(4000);
    expect(mackerel.amount).toBe(7_200_000);
    expect(mackerel.saleDate).toBe("2026-07-31");
  });

  it("빈/오류 응답에는 빈 배열", () => {
    expect(parseFishMarketRows({})).toEqual([]);
    expect(parseFishMarketRows(null)).toEqual([]);
    expect(parseFishMarketRows({ response: { body: {} } })).toEqual([]);
  });
});

/**
 * 축 회귀 테스트.
 * 원/kg는 **금액 ÷ 중량**으로만 만든다. 단위 문자열("상자(CS)")은
 * 계산에 개입하지 않는다 — 개입하는 순간 KAMIS와 같은 축 사고가 난다.
 */
describe("rowPerKg — 금액 ÷ 중량", () => {
  it("단위명이 상자여도 금액÷중량으로 원/kg를 얻는다", () => {
    // 7,200,000원 ÷ 4,000kg = 1,800원/kg
    expect(rowPerKg(row({ amount: 7_200_000, weightKg: 4000 }))).toBe(1800);
  });

  it("중량이나 금액이 없으면 단가로 대체하지 않고 null", () => {
    expect(rowPerKg(row({ amount: 7_200_000, weightKg: 0, unitPrice: 36000 })))
      .toBeNull();
    expect(rowPerKg(row({ amount: 0, weightKg: 4000, unitPrice: 36000 })))
      .toBeNull();
  });
});

describe("aggregateBySpeciesPerKg", () => {
  it("총금액 ÷ 총중량으로 중량 가중평균을 낸다", () => {
    const agg = aggregateBySpeciesPerKg([
      row({ itemName: "갈치", amount: 11_000_000, weightKg: 500, marketName: "A" }),
      row({ itemName: "갈치", amount: 1_000_000, weightKg: 100, marketName: "B" }),
    ]);
    // (11,000,000 + 1,000,000) ÷ (500 + 100) = 20,000
    const hairtail = agg.get("갈치")!;
    expect(hairtail.perKg).toBe(20_000);
    expect(hairtail.totalWeightKg).toBe(600);
    expect(hairtail.marketCount).toBe(2);
    expect(hairtail.rejected).toBeNull();
  });

  it("신선 행이 있으면 냉동을 섞지 않는다", () => {
    const agg = aggregateBySpeciesPerKg(parseFishMarketRows(SAMPLE_JSON));
    const mackerel = agg.get("고등어")!;
    // 신선만: 7,200,000 ÷ 4,000 = 1,800 (냉동 500원/kg은 제외)
    expect(mackerel.perKg).toBe(1800);
    expect(mackerel.sampleRows).toBe(1);
  });

  it("신선 행이 없으면 있는 행을 모두 쓴다", () => {
    const agg = aggregateBySpeciesPerKg([
      row({ itemName: "명태", condition: "냉동", amount: 2_000_000, weightKg: 1000 }),
    ]);
    expect(agg.get("명태")?.perKg).toBe(2000);
  });

  it("위판단가가 원/kg인지 비율로 교차검증한다", () => {
    // 단가 36,000원(상자) vs 원/kg 1,800 → 비율 20 → 상자 기준이라는 뜻
    const boxed = aggregateBySpeciesPerKg([
      row({ amount: 7_200_000, weightKg: 4000, unitPrice: 36_000 }),
    ]);
    expect(boxed.get("고등어")?.unitPriceRatio).toBe(20);

    // 단가가 원/kg이면 비율 ≈ 1
    const perKgUnit = aggregateBySpeciesPerKg([
      row({ amount: 7_200_000, weightKg: 4000, unitPrice: 1800 }),
    ]);
    expect(perKgUnit.get("고등어")?.unitPriceRatio).toBe(1);
  });

  it("중량 단위가 어긋나면(kg 아님) 상식 범위에서 걸러낸다", () => {
    // csmtWt가 톤이었다면 원/kg가 1000배로 튄다
    const agg = aggregateBySpeciesPerKg([
      row({ itemName: "갈치", amount: 11_000_000, weightKg: 0.5 }),
    ]);
    const hairtail = agg.get("갈치")!;
    expect(hairtail.perKg).toBeGreaterThan(FISH_PLAUSIBLE_PER_KG.max);
    expect(hairtail.rejected).toMatch(/상식 범위 밖/);
  });

  it("환산 불가 행만 있으면 품목 자체가 빠진다", () => {
    const agg = aggregateBySpeciesPerKg([
      row({ itemName: "꽃게", amount: 0, weightKg: 0, unitPrice: 40_000 }),
    ]);
    expect(agg.has("꽃게")).toBe(false);
  });
});
