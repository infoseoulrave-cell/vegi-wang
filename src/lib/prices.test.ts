import { describe, expect, it } from "vitest";
import {
  AXIS_DIVERGENCE_LIMIT,
  CARRY_FORWARD_DAYS,
  resolveAuctionPerKg,
  resolveWithCarryForward,
} from "./prices";
import type { PricePoint } from "./types";

/**
 * 축 게이트 회귀 테스트.
 *
 * 예전 reconcileAuctionPrice는 두 값이 3.5배 이상 벌어지면 **낮은 쪽(KAMIS)을
 * 채택**했다. 가락은 원/거래단위, KAMIS는 원/kg였으므로 차이는 항상 weightKg
 * 배였고, 결과적으로 정상값인 가락 상자가를 언제나 버렸다. 그 값이 서빙에서
 * 다시 weightKg로 나눠지며 무 36원/kg 같은 값이 나왔다.
 *
 * 지금은 양쪽 모두 원/kg 축이므로 크게 벌어지면 "둘 중 하나가 잘못됐다"는
 * 신호이지 선택의 문제가 아니다 — 둘 다 버린다.
 */
describe("resolveAuctionPerKg", () => {
  it("두 소스가 정합하면 가락을 채택한다", () => {
    // 배추 실측: 가락 1,895원/kg vs KAMIS 1,128원/kg
    expect(resolveAuctionPerKg(1895, 1128).perKg).toBe(1895);
  });

  it("aT가 있으면 가락·KAMIS보다 우선한다", () => {
    // aT는 전국 시장을 한 번에 주고 거래량 가중이 가능하다
    expect(resolveAuctionPerKg(1895, 1128, 1800).perKg).toBe(1800);
    expect(resolveAuctionPerKg(null, null, 1800).perKg).toBe(1800);
  });

  it("aT가 없으면 가락으로, 가락도 없으면 KAMIS로 떨어진다", () => {
    expect(resolveAuctionPerKg(1895, 1128, null).perKg).toBe(1895);
    expect(resolveAuctionPerKg(null, 1128, null).perKg).toBe(1128);
  });

  it("채택값과 어느 한 소스라도 크게 어긋나면 전부 버린다", () => {
    // aT 1,800 vs 가락 19,461 → 10배 이상
    const r = resolveAuctionPerKg(19461, 1128, 1800);
    expect(r.perKg).toBeNull();
    expect(r.rejected).toMatch(/축 불일치/);
  });

  it("한쪽만 있으면 그것을 쓴다", () => {
    expect(resolveAuctionPerKg(1900, null).perKg).toBe(1900);
    expect(resolveAuctionPerKg(null, 2100).perKg).toBe(2100);
  });

  it("둘 다 없으면 null (샘플로 채우지 않는다)", () => {
    const r = resolveAuctionPerKg(null, null);
    expect(r.perKg).toBeNull();
    expect(r.rejected).toBeNull();
  });

  it("축이 어긋난 만큼 벌어지면 낮은 쪽을 고르지 않고 둘 다 거부한다", () => {
    const r = resolveAuctionPerKg(19461, 1128); // 약 17배
    expect(r.perKg).toBeNull();
    expect(r.rejected).toMatch(/축 불일치/);
  });

  it("거부 임계는 양방향으로 동작한다", () => {
    expect(resolveAuctionPerKg(100, 100 * AXIS_DIVERGENCE_LIMIT).perKg).toBeNull();
    expect(resolveAuctionPerKg(100 * AXIS_DIVERGENCE_LIMIT, 100).perKg).toBeNull();
    // 임계 미만은 통과
    expect(resolveAuctionPerKg(100, 900).perKg).toBe(100);
  });

  it("0이나 음수는 값이 없는 것으로 본다", () => {
    expect(resolveAuctionPerKg(0, 2100).perKg).toBe(2100);
    expect(resolveAuctionPerKg(-5, null).perKg).toBeNull();
  });
});

describe("resolveWithCarryForward", () => {
  const series: PricePoint[] = [
    { date: "2026-07-24", price: 900 },
    { date: "2026-07-29", price: 1100 },
  ];

  it("당일 실측이 있으면 live", () => {
    const r = resolveWithCarryForward(1200, series, "2026-07-31");
    expect(r).toEqual({ perKg: 1200, status: "live" });
  });

  it("당일이 없으면 최근 실측을 이월하고 기준일을 남긴다", () => {
    const r = resolveWithCarryForward(null, series, "2026-07-31");
    expect(r).toEqual({
      perKg: 1100,
      status: "carried",
      asOfDate: "2026-07-29",
    });
  });

  it(`${CARRY_FORWARD_DAYS}일을 넘긴 값은 이월하지 않는다`, () => {
    const stale: PricePoint[] = [{ date: "2026-07-01", price: 900 }];
    expect(resolveWithCarryForward(null, stale, "2026-07-31")).toBeNull();
  });

  it("이월 대상이 없으면 null — 샘플로 대체하지 않는다", () => {
    expect(resolveWithCarryForward(null, [], "2026-07-31")).toBeNull();
  });

  it("미래 날짜는 이월 후보가 아니다", () => {
    const future: PricePoint[] = [{ date: "2026-08-05", price: 1500 }];
    expect(resolveWithCarryForward(null, future, "2026-07-31")).toBeNull();
  });
});
