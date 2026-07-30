import { describe, expect, it } from "vitest";
import { recentMarketDateCandidates } from "./item-detail";

describe("recentMarketDateCandidates", () => {
  it("일요일을 건너뛰고 요청 개수만큼 반환한다", () => {
    // 2026-07-26 = 일요일
    const dates = recentMarketDateCandidates("2026-07-26", 5);
    expect(dates).toHaveLength(5);
    expect(dates.includes("2026-07-26")).toBe(false);
    expect(dates[0]).toBe("2026-07-25");
  });
});
