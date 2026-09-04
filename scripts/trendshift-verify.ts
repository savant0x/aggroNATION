/**
 * FID-2026-0904-003 verification — trendshift scraper end-to-end vs the live
 * site and production Firestore. Non-destructive: the seeded source is
 * left in place (operator asked for it anyway) and content docs use the
 * standard deterministic ids (idempotent upserts).
 *
 * Run: npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/trendshift-verify.ts
 */

import "dotenv/config";

import {
  canonicalizeTrendshiftUrl,
  fetchTrendingRepos,
} from "../lib/fetchers/trendshift";
import {
  createSource,
  getSourceByUrl,
} from "../lib/repositories/source-repo";
import { runFetchForSource } from "../lib/services/fetch-service";
import { getContentById } from "../lib/repositories/content-repo";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const SOURCE_URL = "https://trendshift.io/?sort=views";

async function main(): Promise<void> {
  // 1. URL canonicalization
  check(
    "canonicalize: bare root -> ?sort=views",
    canonicalizeTrendshiftUrl("https://trendshift.io") ===
      "https://trendshift.io/?sort=views",
  );
  check(
    "canonicalize: rejects foreign host",
    canonicalizeTrendshiftUrl("https://evil.example/?sort=views") === null,
  );
  check(
    "canonicalize: rejects /api/ paths (robots.txt)",
    canonicalizeTrendshiftUrl("https://trendshift.io/api/x") === null,
  );

  // 2. Live fetcher probe
  const { repos, errors } = await fetchTrendingRepos({
    url: SOURCE_URL,
    maxItems: 30,
  });
  check("live fetch: >= 20 repos parsed", repos.length >= 20, `${repos.length}`);
  check(
    "live fetch: slugs well-formed",
    repos.every((r) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.slug)),
  );
  check(
    "live fetch: slugs unique",
    new Set(repos.map((r) => r.slug)).size === repos.length,
  );
  check(
    "live fetch: views parsed for most rows",
    repos.filter((r) => r.views !== null).length >= Math.floor(repos.length * 0.8),
  );
  // Probed reality: main-list rows carry trendshift-internal identity; the
  // github links seen on the page belong to sponsor/sidebar widgets. Github
  // urls are a bonus, not a majority expectation — rows without one fall back
  // to the trendshift repository page as url.
  check(
    "live fetch: every repo has a usable origin url",
    repos.every((r) => r.githubUrl !== null || r.trendshiftId !== null),
  );
  check("live fetch: per-item errors collected, not thrown", Array.isArray(errors));

  // 3. Source registration (idempotent)
  let source = await getSourceByUrl(SOURCE_URL);
  if (!source) {
    source = await createSource({
      type: "trendshift",
      name: "Trendshift",
      url: SOURCE_URL,
    });
    check("register: trendshift source created", true, source.id);
  } else {
    check("register: trendshift source already exists", true, source.id);
  }

  // 4. Pipeline fetch + persistence
  const outcome = await runFetchForSource(source);
  check(
    "pipeline: fetch ok",
    outcome.ok,
    `items=${outcome.itemsFetched}${outcome.error ? ` error=${outcome.error.slice(0, 90)}` : ""}`,
  );
  check("pipeline: items persisted", outcome.itemsFetched > 0, `${outcome.itemsFetched}`);

  const first = repos[0];
  if (first) {
    const docId = `trendshift_${first.slug.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    try {
      const doc = await getContentById(docId);
      check(
        "persistence: first repo readable via repo layer",
        doc !== null && doc.sourceType === "trendshift",
        doc ? `rating=${doc.metrics.rating.toFixed(3)}` : "missing",
      );
      check(
        "persistence: reader body stored",
        typeof doc?.contentHtml === "string" && doc.contentHtml.length > 0,
      );
    } catch (error) {
      check("persistence: first repo readable via repo layer", false, String(error));
    }

    // 5. Idempotent re-fetch: same doc ids upserted, no duplicates possible.
    const second = await runFetchForSource(source);
    check(
      "idempotency: re-fetch converges on same item count",
      second.ok && Math.abs(second.itemsFetched - outcome.itemsFetched) <= 2,
      `first=${outcome.itemsFetched} second=${second.itemsFetched}`,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
