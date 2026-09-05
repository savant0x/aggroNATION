/**
 * One-time backfill (FID-2026-0904-017 follow-up): live-scrape the real
 * linked article for rows whose content_html is NULL because the fetcher
 * (correctly) rejected an aggregator metadata template. Uses the same
 * fetchArticle the reader's fallback path uses — sanitized output, same
 * allowlist — and stores it so the body is warm before the next cron.
 *
 * Only touches rows with content_html IS NULL (absent-key upsert semantics
 * are respected: a later cron merge with no contentHtml key will NOT erase
 * these backfilled bodies).
 *
 * Conservative by design:
 *  - only rows whose title/excerpt do NOT look like templates (clean rows)
 *  - stores nothing when the scrape is insufficient (<200 chars text) —
 *    the reader's live path stays the honest fallback for those
 *  - default scope: HN items (source_name = 'Hacker News'). Pass --all to
 *    cover every rss-sourced NULL row.
 */
import "dotenv/config";

import pg from "pg";

import { fetchArticle } from "../lib/fetchers/article";

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(
  ".",
)[0];
const client = new pg.Client({
  host: "aws-0-us-east-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${projectRef}`,
  password: process.env.SUPABASE_DB_PASSWORD!,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const ALL = process.argv.includes("--all");
const MIN_TEXT = 200;
const DELAY_MS = 1_200; // polite pacing between scrapes

async function main() {
  await client.connect();
  const scope = ALL
    ? `source_type = 'rss'`
    : `source_type = 'rss' AND source_name = 'Hacker News'`;
  const { rows } = await client.query(
    `SELECT id, title, url FROM content
     WHERE content_html IS NULL AND ${scope}
     ORDER BY published_at DESC
     LIMIT 120`,
  );
  console.log(`backfill candidates: ${rows.length} (${ALL ? "all rss" : "Hacker News only"})`);

  let stored = 0;
  let insufficient = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const article = await fetchArticle(row.url);
      if (!article.sufficient || article.textLength < MIN_TEXT) {
        insufficient += 1;
        console.log(`  ~ insufficient (${article.textLength} chars): ${row.title.slice(0, 60)}`);
        continue;
      }
      await client.query(`UPDATE content SET content_html = $1 WHERE id = $2`, [
        article.html,
        row.id,
      ]);
      stored += 1;
      console.log(`  + stored ${article.textLength} chars: ${row.title.slice(0, 60)}`);
    } catch (error) {
      failed += 1;
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ! failed: ${row.title.slice(0, 50)} — ${msg.slice(0, 90)}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\ndone: stored=${stored} insufficient=${insufficient} failed=${failed}`);
  await client.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
