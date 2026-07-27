import { beforeEach, describe, expect, it } from "vitest";
import { buildNaturalKey } from "@/server/domain/models";
import {
  createMemoryRepositories,
  resetMemoryStore,
} from "@/server/repos/memory";
import { runMorningIngest } from "@/server/services/ingest";
import { getServedPriceFeed } from "@/server/services/price-feed";

describe("morning ingest + serve (memory)", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.VEGIWANG_FORCE_MEMORY_WAITLIST = "1";
  });

  it("upserts raw, aggregates daily, and serves feed from DB", async () => {
    const repos = createMemoryRepositories();
    const saleDate = "2026-07-27";

    const dryRows = [
      {
        naturalKey: buildNaturalKey({
          marketCode: "110001",
          corpCode: "11000101",
          itemName: "배추",
          unit: "10kg",
          grade: "상",
          saleDate,
          seq: 0,
          price: 9500,
        }),
        saleDate,
        marketCode: "110001",
        corpCode: "11000101",
        corpName: "서울청과",
        itemName: "배추",
        itemVariety: null,
        unit: "10kg 그물망",
        grade: "상",
        origin: "강원 평창",
        qty: 12,
        price: 9500,
        source: "garak" as const,
      },
      {
        naturalKey: buildNaturalKey({
          marketCode: "110001",
          corpCode: "11000102",
          itemName: "배추",
          unit: "10kg",
          grade: "상",
          saleDate,
          seq: 1,
          price: 10500,
        }),
        saleDate,
        marketCode: "110001",
        corpCode: "11000102",
        corpName: "농협",
        itemName: "배추",
        itemVariety: null,
        unit: "10kg 그물망",
        grade: "상",
        origin: "강원 평창",
        qty: 8,
        price: 10500,
        source: "garak" as const,
      },
    ];

    const result = await runMorningIngest(repos, {
      saleDate,
      dryRows,
      drySource: "garak",
    });

    expect(result.status).toBe("success");
    expect(result.rowsFetched).toBe(2);
    expect(result.dailyUpserted).toBeGreaterThanOrEqual(1);

    const daily = await repos.auction.getDaily("110001", saleDate);
    const cabbage = daily.find((d) => d.itemName === "배추");
    expect(cabbage?.avgPrice).toBe(10000);
    expect(cabbage?.itemId).toBe("cabbage");

    // 멱등: 동일 raw 재수집해도 성공
    const again = await runMorningIngest(repos, {
      saleDate,
      dryRows,
      drySource: "garak",
    });
    expect(again.status).toBe("success");

    const feed = await getServedPriceFeed(repos, saleDate);
    expect(feed.storage).toBe("db");
    const item = feed.items.find((i) => i.id === "cabbage");
    expect(item?.auctionPrice).toBe(10000);
    expect(item?.compass).toBeDefined();
  });

  it("returns empty when no rows and no credentials", async () => {
    const repos = createMemoryRepositories();
    delete process.env.DATA_GO_KR_SERVICE_KEY;
    delete process.env.GARAK_API_ID;
    const result = await runMorningIngest(repos, { saleDate: "2026-07-27" });
    expect(result.status).toBe("empty");
  });
});
