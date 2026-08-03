import { describe, expect, it } from "vitest";
import { buildNaturalKey, type RawAuctionRecord } from "@/server/domain/models";
import {
  aggregateRawToDaily,
  computeBaselines,
  median,
  MIN_BASELINE_SAMPLE_DAYS,
  representativePerKg,
} from "./aggregate";

describe("buildNaturalKey", () => {
  it("같은 입력이면 같은 키 (멱등 upsert)", () => {
    const a = buildNaturalKey({
      marketCode: "110001",
      corpCode: "11000101",
      itemName: "배추",
      unit: "10kg",
      grade: "상",
      saleDate: "2026-07-27",
      seq: 1,
      price: 9800,
    });
    const b = buildNaturalKey({
      marketCode: "110001",
      corpCode: "11000101",
      itemName: "배추",
      unit: "10kg",
      grade: "상",
      saleDate: "2026-07-27",
      seq: 1,
      price: 9800,
    });
    expect(a).toBe(b);
  });
});

function raw(
  key: string,
  unit: string | null,
  price: number,
  pricePerKg: number | null,
  unitKg: number | null,
  qty: number | null = null,
): RawAuctionRecord {
  return {
    naturalKey: key,
    saleDate: "2026-07-27",
    marketCode: "110001",
    corpCode: key,
    corpName: null,
    itemName: "배추",
    itemVariety: null,
    unit,
    grade: "상",
    origin: "강원",
    qty,
    price,
    unitKg,
    pricePerKg,
    source: "garak",
  };
}

describe("aggregateRawToDaily", () => {
  it("원/kg 축으로 평균낸다 — 상자 크기가 달라도 정합하다", () => {
    // 10kg 9,000원(900원/kg)과 20kg 22,000원(1,100원/kg)
    // 원문 price를 평균내면 15,500이라는 무의미한 값이 나온다.
    const daily = aggregateRawToDaily(
      [
        raw("a", "10kg", 9000, 900, 10, 10),
        raw("b", "20kg", 22000, 1100, 20, 20),
      ],
      new Map([["배추", "cabbage"]]),
    );
    expect(daily).toHaveLength(1);
    expect(daily[0].avgPricePerKg).toBe(1000);
    expect(daily[0].minPricePerKg).toBe(900);
    expect(daily[0].maxPricePerKg).toBe(1100);
    expect(daily[0].volume).toBe(30);
    expect(daily[0].tradeCount).toBe(2);
    expect(daily[0].itemId).toBe("cabbage");
    expect(daily[0].priceStatus).toBe("live");
  });

  it("중량 환산이 불가능한 행은 집계에서 제외한다 (추정하지 않는다)", () => {
    const daily = aggregateRawToDaily(
      [
        raw("a", "10kg", 9000, 900, 10),
        raw("b", "1속", 12000, null, null), // 환산 불가
      ],
      new Map([["배추", "cabbage"]]),
    );
    expect(daily).toHaveLength(1);
    expect(daily[0].avgPricePerKg).toBe(900);
    expect(daily[0].tradeCount).toBe(1);
  });

  it("환산 가능한 행이 하나도 없으면 빈 결과", () => {
    const daily = aggregateRawToDaily(
      [raw("a", "1속", 12000, null, null)],
      new Map(),
    );
    expect(daily).toEqual([]);
  });
});

function daily(saleDate: string, avgPricePerKg: number) {
  return {
    saleDate,
    marketCode: "110001",
    itemId: "cabbage",
    itemName: "배추",
    avgPricePerKg,
    medianPricePerKg: avgPricePerKg,
    minPricePerKg: avgPricePerKg,
    maxPricePerKg: avgPricePerKg,
    unitKg: 10,
    volume: null,
    tradeCount: 1,
    unit: "10kg",
    grade: null,
    origin: null,
    source: "garak",
    priceStatus: "live" as const,
    asOfDate: null,
  };
}

describe("computeBaselines", () => {
  it(`표본이 ${MIN_BASELINE_SAMPLE_DAYS}일 미만이면 null — 이동평균인 척하지 않는다`, () => {
    const b = computeBaselines({
      itemId: "cabbage",
      marketCode: "110001",
      asOfDate: "2026-07-27",
      windowDays: 30,
      dailyRows: [daily("2026-07-25", 9000), daily("2026-07-27", 11000)],
    });
    expect(b).toBeNull();
  });

  it("표본이 충분하면 원/kg 이동평균과 근거를 남긴다", () => {
    const rows = Array.from({ length: MIN_BASELINE_SAMPLE_DAYS }, (_, i) =>
      daily(`2026-07-${String(i + 10).padStart(2, "0")}`, i < 7 ? 900 : 1100),
    );
    const b = computeBaselines({
      itemId: "cabbage",
      marketCode: "110001",
      asOfDate: "2026-07-27",
      windowDays: 30,
      dailyRows: rows,
    });
    expect(b?.sampleDays).toBe(MIN_BASELINE_SAMPLE_DAYS);
    expect(b?.avgPricePerKg).toBe(1000);
    expect(b?.method).toBe("moving_avg_30");
  });

  it("창 밖의 날짜는 표본에서 제외한다", () => {
    const rows = [
      ...Array.from({ length: MIN_BASELINE_SAMPLE_DAYS }, (_, i) =>
        daily(`2026-07-${String(i + 10).padStart(2, "0")}`, 1000),
      ),
      daily("2026-01-01", 50000), // 한참 이전
    ];
    const b = computeBaselines({
      itemId: "cabbage",
      marketCode: "110001",
      asOfDate: "2026-07-27",
      windowDays: 30,
      dailyRows: rows,
    });
    expect(b?.sampleDays).toBe(MIN_BASELINE_SAMPLE_DAYS);
    expect(b?.avgPricePerKg).toBe(1000);
  });
});

describe("대표가는 중앙값이다", () => {
  /*
   * 2026-08-03 실측에서 드러난 문제. 같은 날 같은 "무"인데 포장별로
   * 원/kg가 7.5배 벌어졌다 — 4kg 868행 3,271원, 8kg 848행 1,879원,
   * 20kg 398행 439원. 단순 평균은 행 하나를 한 표로 세므로 소포장 행이
   * 많으면 대표가가 위로 밀린다. 소매보다 도매가 비싸 보이던 원인이다.
   */
  it("소포장 이상치가 대표가를 끌어올리지 못한다", () => {
    const rows = [
      // 20kg 대량 — 실제 시세에 가깝다
      ...Array.from({ length: 5 }, (_, i) => raw(`b${i}`, "20kg", 8800, 440, 20)),
      // 4kg 소포장 — 프리미엄이라 원/kg가 훨씬 높다
      ...Array.from({ length: 4 }, (_, i) => raw(`s${i}`, "4kg", 13000, 3250, 4)),
    ];
    const [d] = aggregateRawToDaily(rows, new Map());

    expect(d.avgPricePerKg).toBe(1689); // 평균은 소포장에 끌려간다
    expect(d.medianPricePerKg).toBe(440); // 중앙값은 버틴다
    expect(representativePerKg(d)).toBe(440);
  });

  it("행이 짝수면 가운데 두 값의 평균", () => {
    const rows = [
      raw("a", "10kg", 10000, 1000, 10),
      raw("b", "10kg", 20000, 2000, 10),
    ];
    const [d] = aggregateRawToDaily(rows, new Map());
    expect(d.medianPricePerKg).toBe(1500);
  });

  it("median이 비어 있는 옛 행은 평균으로 물러난다", () => {
    // 005 마이그레이션 이전에 쌓인 행. 0을 대표가로 내보내면 안 된다.
    expect(representativePerKg({ medianPricePerKg: 0, avgPricePerKg: 1234 })).toBe(1234);
    expect(representativePerKg({ medianPricePerKg: null, avgPricePerKg: 1234 })).toBe(1234);
  });
});

describe("median", () => {
  it("빈 배열은 0", () => {
    expect(median([])).toBe(0);
  });
  it("원본을 변형하지 않는다", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});
