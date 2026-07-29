import { createPostgresRepositories } from "../src/server/repos/postgres";
import { setRepositoriesForTest } from "../src/server/repos/index";
import { getServedPriceFeed } from "../src/server/services/price-feed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const repos = createPostgresRepositories(url);
  setRepositoriesForTest(repos);
  const feed = await getServedPriceFeed(repos, process.argv[2] || "2026-07-29");
  console.log(
    JSON.stringify(
      {
        storage: feed.storage,
        auctionSource: feed.auctionSource,
        retailSource: feed.retailSource,
        date: feed.date,
        sample: feed.items.slice(0, 5).map((i) => ({
          id: i.id,
          name: i.name,
          auctionPrice: i.auctionPrice,
          compass: i.compass,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
