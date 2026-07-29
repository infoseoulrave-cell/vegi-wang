import { createPostgresRepositories } from "../src/server/repos/postgres";
import { setRepositoriesForTest } from "../src/server/repos/index";
import { runMorningIngest } from "../src/server/services/ingest";
import { getEnv } from "../src/server/config/env";

function log(...args: unknown[]) {
  console.error(new Date().toISOString(), ...args);
}

async function main() {
  const saleDate = process.argv[2];
  const url = getEnv().databaseUrl;
  if (!url) {
    log("no DATABASE_URL");
    process.exit(1);
  }
  log("connecting postgres…");
  const repos = createPostgresRepositories(url);
  setRepositoriesForTest(repos);
  log("storage:", repos.kind);

  log("starting ingest", saleDate || "(today KST)");
  const result = await runMorningIngest(
    repos,
    saleDate ? { saleDate } : {},
  );
  log("done");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "failed" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
