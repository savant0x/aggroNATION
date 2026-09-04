/**
 * Register operator-requested sources (2026-09-04; Supabase migration
 * edition per FID-2026-0904-010) — mirrors POST /api/admin/sources exactly
 * (Law 13): the same repo create path, the same duplicate rule (URL match →
 * skip), the same auto-fetch-on-create. Idempotent: re-running skips sources
 * that already exist without re-fetching.
 *
 * Probed before registration:
 *   - https://hnrss.org/frontpage              → RSS 2.0 (Hacker News official
 *     community mirror; news.ycombinator.com/rss itself serves HTML)
 *   - https://huggingface.co/api/daily_papers  → native huggingface fetcher
 *     (FID-022) — needs a huggingface-typed SOURCE pointing at the site;
 *     the fetcher consumes the API regardless of the registered URL
 *   - https://www.opensourceprojects.dev/rss   → RSS 2.0; registered as the
 *     `opensource` TYPE per FID-2026-0904-009 (its own category, not rss)
 *   - trendshift.io listing (scraper fetcher, FID-2026-0904-003); the source
 *     URL is the ?sort=views listing the scraper parses
 *   - Reddit per-subreddit hot.rss (FID-022 transport)
 *
 * Run: npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/register-operator-sources.ts
 */

import "dotenv/config";

import { createSource, getSourceByUrl } from "../lib/repositories/source-repo";
import { runFetchForSource } from "../lib/services/fetch-service";
import type { SourceType } from "../lib/schemas/content";

interface RequestedSource {
  type: Exclude<SourceType, "youtube">;
  name: string;
  url: string;
}

const REQUESTED: RequestedSource[] = [
  {
    type: "rss",
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
  },
  {
    type: "huggingface",
    name: "HuggingFace Daily Papers",
    url: "https://huggingface.co/papers",
  },
  {
    type: "opensource",
    name: "Open Source Projects",
    url: "https://www.opensourceprojects.dev/rss",
  },
  {
    type: "trendshift",
    name: "Trendshift",
    url: "https://trendshift.io/?sort=views",
  },
  {
    type: "reddit",
    name: "r/AI_Agents",
    url: "https://www.reddit.com/r/AI_Agents/hot.rss",
  },
  {
    type: "reddit",
    name: "r/singularity",
    url: "https://www.reddit.com/r/singularity/hot.rss",
  },
];

async function main(): Promise<void> {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const req of REQUESTED) {
    try {
      const existing = await getSourceByUrl(req.url);
      if (existing) {
        console.log(`SKIP  [${req.type}] ${req.name} — already exists (${existing.id})`);
        skipped += 1;
        continue;
      }

      const source = await createSource({
        type: req.type,
        name: req.name,
        url: req.url,
      });
      console.log(`CREATE [${req.type}] ${req.name} -> ${source.id}`);

      // Same awaited auto-fetch contract as the admin API (FID-016):
      // the feed is filled before we report; failures are data, not thrown.
      const outcome = await runFetchForSource(source);
      console.log(
        `FETCH  ${outcome.ok ? "OK" : "FAIL"} items=${outcome.itemsFetched}${outcome.error ? ` error="${outcome.error.slice(0, 160)}"` : ""}`,
      );
      if (!outcome.ok) failed += 1;
      created += 1;
    } catch (error) {
      failed += 1;
      console.error(`ERROR  ${req.name}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\ncreated: ${created}, skipped: ${skipped}, fetch-failures: ${failed}`);
  process.exit(failed > 0 && created === 0 && skipped === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
