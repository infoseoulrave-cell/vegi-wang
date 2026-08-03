import {
  addEntry as addFileEntry,
  countEntries as countFileEntries,
} from "@/lib/waitlist";
import { hasDatabase } from "@/server/config/env";
import type { Repositories } from "@/server/repos/types";

/**
 * 니즈 DB 등록 우선순위:
 * 1) Postgres (DATABASE_URL)
 * 2) 명시적 메모리 리포지 (테스트: VEGIWANG_FORCE_MEMORY_WAITLIST=1)
 * 3) 파일/인메모리 폴백 (`src/lib/waitlist.ts`)
 */
export async function registerWaitlist(
  repos: Repositories,
  email: string,
  interest: string,
): Promise<{ ok: true; total: number }> {
  const trimmed = interest.slice(0, 200) || "전체";
  if (shouldUseRepoWaitlist(repos)) {
    const result = await repos.waitlist.add(email, trimmed);
    return { ok: true, total: result.total };
  }
  return addFileEntry(email, trimmed);
}

export async function getWaitlistTotal(repos: Repositories): Promise<number> {
  if (shouldUseRepoWaitlist(repos)) {
    return repos.waitlist.count();
  }
  return countFileEntries();
}

function shouldUseRepoWaitlist(repos: Repositories): boolean {
  if (hasDatabase()) return true;
  if (process.env.VEGIWANG_FORCE_MEMORY_WAITLIST === "1") return true;
  return repos.kind === "postgres";
}
