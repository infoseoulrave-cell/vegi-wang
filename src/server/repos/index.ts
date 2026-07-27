import { getEnv, hasDatabase } from "@/server/config/env";
import { createMemoryRepositories } from "@/server/repos/memory";
import { createPostgresRepositories } from "@/server/repos/postgres";
import type { Repositories } from "@/server/repos/types";

let cached: Repositories | null = null;

/** DATABASE_URL 있으면 Postgres, 없으면 메모리 리포지토리 */
export function getRepositories(): Repositories {
  if (cached) return cached;
  if (hasDatabase()) {
    cached = createPostgresRepositories(getEnv().databaseUrl!);
  } else {
    cached = createMemoryRepositories();
  }
  return cached;
}

/** 테스트에서 리포지 교체용 */
export function setRepositoriesForTest(repos: Repositories | null): void {
  cached = repos;
}
