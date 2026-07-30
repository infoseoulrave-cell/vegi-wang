import { describe, expect, it } from "vitest";
import {
  gradeConfidence,
  madFilter,
  singleWeightKg,
  stripTags,
  toRetailBand,
  type NaverShopItem,
} from "./naverShop";

describe("stripTags", () => {
  it("검색 하이라이트 태그를 제거", () => {
    expect(stripTags("국내산 <b>배추</b> 3kg")).toBe("국내산 배추 3kg");
  });
});

describe("singleWeightKg", () => {
  it("중량 표기가 하나면 kg으로 환산", () => {
    expect(singleWeightKg("국내산 양파 3kg")).toBe(3);
    expect(singleWeightKg("대파 1.5KG 산지직송")).toBe(1.5);
    expect(singleWeightKg("깻잎 500g")).toBe(0.5);
  });

  it("옵션 다중중량 제목은 환산 불가 — lprice가 어느 옵션인지 알 수 없다", () => {
    expect(singleWeightKg("감자 3kg 5kg 10kg")).toBeNull();
    expect(singleWeightKg("무 세척무 3kg, 5kg, 10kg 내외")).toBeNull();
  });

  it("kg과 g이 함께 있으면 모호하므로 폐기", () => {
    expect(singleWeightKg("사과 5kg 낱개 200g")).toBeNull();
  });

  it("50g 미만 표기는 중량으로 보지 않는다", () => {
    expect(singleWeightKg("고추 10g 시즈닝")).toBeNull();
  });

  it("상식 범위를 벗어난 중량은 폐기", () => {
    expect(singleWeightKg("업소용 감자 500kg")).toBeNull();
    expect(singleWeightKg("샘플 0.05kg")).toBeNull();
  });

  it("중량 표기가 없으면 null", () => {
    expect(singleWeightKg("제철 사과 한 박스")).toBeNull();
  });
});

describe("madFilter", () => {
  it("중앙값에서 크게 벗어난 값을 제거", () => {
    const vals = [1000, 1050, 1100, 1080, 1020, 90000];
    expect(madFilter(vals)).not.toContain(90000);
    expect(madFilter(vals)).toContain(1000);
  });

  it("표본이 4개 미만이면 그대로 둔다", () => {
    const vals = [100, 200, 90000];
    expect(madFilter(vals)).toEqual(vals);
  });
});

describe("gradeConfidence", () => {
  it("표본이 크고 변동이 작으면 high", () => {
    expect(gradeConfidence(20, 0.2)).toBe("high");
  });
  it("표본이 작거나 변동이 크면 등급이 내려간다", () => {
    expect(gradeConfidence(10, 0.5)).toBe("medium");
    expect(gradeConfidence(3, 0.2)).toBe("low");
    expect(gradeConfidence(30, 0.9)).toBe("low");
  });
});

describe("toRetailBand", () => {
  const item = (title: string, lprice: number): NaverShopItem => ({
    title,
    lprice: String(lprice),
  });

  it("원/kg 밴드와 신뢰등급을 산출", () => {
    const items = [
      item("국내산 양파 3kg", 6000), // 2000
      item("국내산 양파 5kg", 10000), // 2000
      item("햇양파 2kg", 4200), // 2100
      item("무안 양파 1kg", 2200), // 2200
      item("양파 4kg", 7600), // 1900
    ];
    const band = toRetailBand(items);
    expect(band).not.toBeNull();
    expect(band!.sampleSize).toBe(5);
    expect(band!.pricePerKg).toBe(2000);
    expect(band!.p25PerKg).toBeLessThanOrEqual(band!.pricePerKg);
    expect(band!.p75PerKg).toBeGreaterThanOrEqual(band!.pricePerKg);
    expect(band!.confidence).toBe("low"); // 표본 5개 → high 불가
  });

  it("가공품·수입산을 제외", () => {
    const items = [
      item("절임배추 20kg", 60000),
      item("중국산 깐대파 10kg", 18000),
      item("배추김치 3kg", 30000),
      item("국내산 배추 3kg", 9000),
      item("국내산 배추 5kg", 15000),
      item("국내산 배추 2kg", 6000),
      item("국내산 배추 4kg", 12000),
    ];
    const band = toRetailBand(items);
    expect(band).not.toBeNull();
    expect(band!.sampleSize).toBe(4); // 국내산 생배추 4건만
    expect(band!.pricePerKg).toBe(3000);
  });

  it("유사 품종을 제외", () => {
    const items = [
      item("알배기배추 3kg", 15000),
      item("쌈배추 2kg", 12000),
      item("국내산 배추 3kg", 9000),
      item("국내산 배추 5kg", 15000),
      item("국내산 배추 2kg", 6000),
      item("국내산 배추 4kg", 12000),
    ];
    const band = toRetailBand(items, /알배기|쌈배추/);
    expect(band!.sampleSize).toBe(4);
    expect(band!.pricePerKg).toBe(3000);
  });

  it("유효 표본이 4건 미만이면 null — 밴드를 만들지 않는다", () => {
    const items = [
      item("국내산 배추 3kg", 9000),
      item("배추 3kg 5kg 10kg", 9000), // 옵션 → 폐기
      item("절임배추 20kg", 60000), // 가공 → 폐기
    ];
    expect(toRetailBand(items)).toBeNull();
  });
});
