#!/usr/bin/env node
/** Direct ingest without HTTP timeout — uses .env.local */
import { getRepositories } from "../src/server/repos/index.ts";
import { runMorningIngest } from "../src/server/services/ingest.ts";

const saleDate = process.argv[2]; // optional YYYY-MM-DD
const repos = getRepositories();
console.log("storage", repos.kind);
const result = await runMorningIngest(repos, saleDate ? { saleDate } : {});
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "failed" ? 1 : 0);
