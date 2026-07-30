import { describe, expect, it } from "vitest";
import {
  extractKamisSeriesPerKg,
  latestDailySlot,
  parseKamisRows,
  pickPreferredRows,
  resolveKamisPerKg,
  type DprSlot,
  type KamisRow,
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

function row(
  partial: Omit<Partial<KamisRow>, "raw"> & {
    unit: string;
    raw?: Partial<Record<DprSlot, number>>;
  },
): KamisRow {
  return {
    itemName: partial.itemName ?? "테스트",
    rank: partial.rank ?? "상품",
    unit: partial.unit,
    raw: {
      dpr1: 0,
      dpr2: 0,
      dpr3: 0,
      dpr4: 0,
      dpr5: 0,
      dpr6: 0,
      dpr7: 0,
      ...(partial.raw ?? {}),
    },
  };
}

describe("parseKamisRows", () => {
  it("품목명·단위와 슬롯 원시값을 축 변환 없이 보존한다", () => {
    const rows = parseKamisRows(SAMPLE_JSON, "2026-07-29");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.itemName).toBe("사과");
    expect(rows[0]?.raw.dpr1).toBe(5800);
    expect(rows[0]?.raw.dpr7).toBe(6700);
    expect(rows[1]?.itemName).toBe("배추");
  });

  it("'-'는 0(결측)으로 읽는다", () => {
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
    expect(rows[0]?.raw.dpr1).toBe(0);
    expect(rows[0]?.raw.dpr3).toBe(3540);
    expect(latestDailySlot(rows[0]!.raw)).toBe("dpr3");
  });

  it("빈/오류 응답에는 빈 배열을 반환한다", () => {
    expect(parseKamisRows({})).toEqual([]);
    expect(parseKamisRows(null)).toEqual([]);
  });
});

/**
 * 축 규칙 회귀 테스트 — 2026-07-31 프로덕션 실측으로 확정한 동작.
 * 이게 깨지면 무 36원/kg, 거품배수 64배 같은 값이 다시 화면에 나간다.
 */
describe("resolveKamisPerKg — 슬롯별 축 규칙", () => {
  it("중량 단위 dpr1~dpr4는 이미 원/kg이므로 그대로 쓴다", () => {
    // 배추 실측: unit="10kg(그물망 3포기)", dpr2=1,128 → 1,128원/kg
    expect(
      resolveKamisPerKg("dpr2", 1128, "10kg(그물망 3포기)"),
    ).toBe(1128);
    expect(resolveKamisPerKg("dpr1", 5800, "1kg")).toBe(5800);
  });

  it("중량 단위 dpr5~dpr7은 거래단위 가격이므로 unitKg로 나눈다", () => {
    // 배추 실측: dpr7=13,146 / 10kg = 1,315원/kg
    // (원/kg로 읽으면 배추 평년가가 13,146원/kg이 되어 물리적으로 불가능)
    expect(resolveKamisPerKg("dpr7", 13146, "10kg(그물망 3포기)")).toBe(1315);
    expect(resolveKamisPerKg("dpr6", 14584, "10kg(그물망 3포기)")).toBe(1458);
    expect(resolveKamisPerKg("dpr5", 7372, "10kg(그물망 3포기)")).toBe(737);
  });

  it("개수 단위는 어떤 슬롯도 변환되지 않아 카탈로그 중량이 있어야 환산된다", () => {
    // 배추 소매 실측: unit="1포기", dpr2=4,018, 1포기=2.8kg → 1,435원/kg
    expect(resolveKamisPerKg("dpr2", 4018, "1포기", 2.8)).toBe(1435);
    // 10개 × 0.25kg = 2.5kg
    expect(resolveKamisPerKg("dpr2", 25000, "10개", 0.25)).toBe(10000);
  });

  it("개수 단위인데 검증된 중량이 없으면 추정하지 않고 null", () => {
    expect(resolveKamisPerKg("dpr2", 4018, "1포기")).toBeNull();
    expect(resolveKamisPerKg("dpr2", 4018, "1포기", 0)).toBeNull();
  });

  it("g 단위도 kg로 정규화한다", () => {
    // 시금치 소매 실측: unit="100g" (중량 단위) → dpr2는 이미 원/kg
    expect(resolveKamisPerKg("dpr2", 16128, "100g")).toBe(16128);
    // dpr7은 변환 안 됨 → 원/100g → ÷0.1
    expect(resolveKamisPerKg("dpr7", 1600, "100g")).toBe(16000);
  });

  it("결측(0)은 null", () => {
    expect(resolveKamisPerKg("dpr1", 0, "1kg")).toBeNull();
  });
});

describe("extractKamisSeriesPerKg", () => {
  it("두 축의 슬롯을 같은 원/kg 축으로 맞춰 시계열을 만든다", () => {
    const s = extractKamisSeriesPerKg(
      row({
        unit: "10kg",
        raw: { dpr2: 1128, dpr3: 899, dpr5: 7372, dpr6: 14584 },
      }),
      "2026-07-31",
    );
    // dpr2/dpr3은 그대로, dpr5/dpr6은 ÷10
    expect(s.map((p) => p.price).sort((a, b) => a - b)).toEqual([
      737, 899, 1128, 1458,
    ]);
  });

  it("환산 근거가 없는 슬롯은 시계열에 넣지 않는다 (섞느니 비운다)", () => {
    const s = extractKamisSeriesPerKg(
      row({ unit: "1포기", raw: { dpr2: 4018, dpr3: 3777 } }),
      "2026-07-31",
    );
    expect(s).toEqual([]);
  });
});

describe("pickPreferredRows", () => {
  it("동일 품목이면 상품 등급을 우선한다", () => {
    const rows = pickPreferredRows([
      row({ itemName: "배추", rank: "중품", unit: "1포기", raw: { dpr1: 3000 } }),
      row({ itemName: "배추", rank: "상품", unit: "1포기", raw: { dpr1: 3540 } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.raw.dpr1).toBe(3540);
  });
});
