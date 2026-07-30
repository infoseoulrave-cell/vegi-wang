import { describe, expect, it } from "vitest";
import { reconcileAuctionPrice } from "./prices";

describe("reconcileAuctionPrice", () => {
  it("가락·KAMIS가 수 배 차이면 KAMIS를 채택한다", () => {
    // 10kg 상자가(19461)를 1kg로 오인한 경우
    expect(reconcileAuctionPrice(19461, 2450, 2600)).toBe(2450);
    expect(reconcileAuctionPrice(1946, 2126, 2600)).toBe(1946);
  });

  it("한쪽만 있으면 그것을 쓰고, 둘 다 없으면 폴백", () => {
    expect(reconcileAuctionPrice(1900, null, 2600)).toBe(1900);
    expect(reconcileAuctionPrice(null, 2100, 2600)).toBe(2100);
    expect(reconcileAuctionPrice(null, null, 2600)).toBe(2600);
  });
});
