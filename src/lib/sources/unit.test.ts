import { describe, expect, it } from "vitest";
import { parseUnitKg, weightedPerKg } from "./unit";

describe("parseUnitKg", () => {
  it("kg/그물망/소수/공백 표기를 kg으로 환산", () => {
    expect(parseUnitKg("10kg")).toBe(10);
    expect(parseUnitKg("10kg 그물망")).toBe(10);
    expect(parseUnitKg("1.2 kg")).toBe(1.2);
    expect(parseUnitKg("1kg 단")).toBe(1);
  });
  it("g 단위는 kg으로", () => {
    expect(parseUnitKg("500g")).toBe(0.5);
  });
  it("중량 환산 불가 단위는 null", () => {
    expect(parseUnitKg("100개 상자")).toBeNull();
    expect(parseUnitKg("20개")).toBeNull();
    expect(parseUnitKg("")).toBeNull();
  });
});

describe("weightedPerKg", () => {
  it("단위가 섞여 있어도 원/kg로 환산 후 수량 가중평균", () => {
    // 10kg에 20000원(=2000/kg, qty 10) + 2kg에 6000원(=3000/kg, qty 0)
    const rows = [
      { price: 20000, unit: "10kg", qty: 3 }, // 2000/kg ×3
      { price: 6000, unit: "2kg", qty: 1 }, // 3000/kg ×1
    ];
    // (2000*3 + 3000*1) / 4 = 2250
    expect(weightedPerKg(rows)).toBe(2250);
  });
  it("중량 환산 불가 행은 제외, 전부 불가면 null", () => {
    expect(weightedPerKg([{ price: 5000, unit: "100개" }])).toBeNull();
    expect(
      weightedPerKg([
        { price: 5000, unit: "100개" },
        { price: 10000, unit: "10kg", qty: 2 },
      ]),
    ).toBe(1000);
  });
});
