/**
 * Full-cycle ingestion entry for scheduled/CI runs.
 *
 * Background: the original hourly GitHub Actions workflow curled
 * `$SITE_URL/api/cron/fetch` with a Bearer CRON_SECRET — a webhook that
 * requires a public deployment. The site had none, so every scheduled run
 * died on an empty URL and the hourly engine never fired (all content came
 * from manual cycles).
 *
 * Since the app now runs on Supabase, the workflow runs this script directly:
 * it loads enabled sources from Supabase, runs the full pipeline
 * (runFetchAllSources), and prints a per-source outcome table. No webhook,
 * no public URL, no CRON_SECRET — the GitHub runner talks to Supabase with
 * the service key from repo secrets.
 *
 * Exit semantics: 0 = batch ran (per-source failures are data, mirrored in
 * source metadata — same contract as GET /api/cron/fetch); 1 = the batch
 * itself crashed or every source failed (a genuinely dead pipeline should
 * fail CI). The webhook route and purge stay in place for when a public
 * deployment exists.
 *
 * Run locally:  npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/fetch-all.ts
 */

import { runFetchAllSources } from "@/lib/services/fetch-service";

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`[fetch-all] cycle starting at ${startedAt}`);

  const result = await runFetchAllSources();

  for (const outcome of result.outcomes) {
    const status = outcome.ok ? "OK  " : "FAIL";
    const type = String(outcome.sourceType).padEnd(12);
    const name = String(outcome.sourceName).padEnd(30);
    const items = String(outcome.itemsFetched).padEnd(5);
    const error = outcome.error ? ` error=${outcome.error}` : "";
    console.log(
      `[fetch-all] ${status} ${type} ${name} items=${items}${error}`,
    );
  }

  console.log(
    `[fetch-all] done at ${new Date().toISOString()}: ` +
      `${result.succeeded}/${result.totalSources} sources OK, ` +
      `${result.itemsFetched} items fetched`,
  );

  if (result.totalSources > 0 && result.succeeded === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "[fetch-all] fatal:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});