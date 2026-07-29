import { beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryRepositories,
  resetMemoryStore,
} from "@/server/repos/memory";
import {
  getWaitlistTotal,
  registerWaitlist,
} from "@/server/services/waitlist";

describe("waitlist service (memory)", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.VEGIWANG_FORCE_MEMORY_WAITLIST = "1";
    delete process.env.DATABASE_URL;
  });

  it("dedupes by email and counts", async () => {
    const repos = createMemoryRepositories();
    const a = await registerWaitlist(repos, "Buyer@Vegiwang.kr", "배추");
    expect(a.ok).toBe(true);
    expect(a.total).toBe(1);

    const b = await registerWaitlist(repos, "buyer@vegiwang.kr", "무");
    expect(b.total).toBe(1);

    const c = await registerWaitlist(repos, "other@vegiwang.kr", "사과");
    expect(c.total).toBe(2);
    expect(await getWaitlistTotal(repos)).toBe(2);
  });
});
