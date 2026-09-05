# FID-2026-0904-017

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-017-hn-metadata-template-garbage.md` |
| **ID**       | FID-2026-0904-017 |
| **Severity** | major |
| **Status**   | converged |
| **Created**  | 2026-09-04 |
| **Author**   | Operator report: "look @ the rss embeds, these look horrible" — `/article/rss_https___news_ycombinator_com_item_id_49568579` |

## Summary

Hacker News feed items render as a horrible metadata dump in the reader:
four dead paragraphs — `Article URL: <link>` / `Comments URL: <link>` /
`Points: N` / `# Comments: N` — with URLs as stripped, unlinked plain text
and the actual linked article (e.g. the Mullvad blog post) nowhere in sight.
hnrss.org puts this template in the feed `description`; the fetcher's
content-worthiness heuristic (`fullPlain.length > title.length + 40`) stores
it as `contentHtml`; FID-020's content-first reader then renders it and
never scrapes the real article.

## Evidence (RED)

- Live doc probe (`scripts/tmp-hn-doc.ts`): the item's `contentHtml` is
  exactly `\n<p>Article URL: https://mullvad.net/…</p>\n<p>Comments URL: …</p>\n<p>Points: 209</p>\n<p># Comments: 76</p>\n`
  (233 chars); `excerpt` is the same template truncated; the linked article
  URL is `item.url` (mullvad.net — scrapable, never attempted).
- DB count: **31 rows** with `content_html LIKE '%Article URL:%Comments URL:%Points:%'`,
  all `source_name = 'Hacker News'`; all **31 excerpts** also polluted
  (excerpt feeds cards + `og:description`).
- Reader order (`app/article/[itemId]/page.tsx`): stored `contentHtml` wins
  over the live scrape — the garbage is rendered before any fallback fires.
- The sanitizer strips anchors (no-exit law), so the template's URLs render
  as dead text — the visual mess in the operator screenshot.

## Proposed Solution (GREEN)

1. **Fetcher-level template detection** (`lib/fetchers/rss.ts`): add an
   `isMetadataTemplate(plain)` check alongside `stripPublisherBoilerplate` —
   a body matching the HN shape (`Article URL:` AND `Comments URL:` AND
   `Points:`/`# Comments:`) is boilerplate, not content. When detected:
   `contentHtml = null`, and the excerpt falls back to the title (the
   template carries zero article information beyond what the title has).
   Generic shape: keyed on the label patterns, not hnrss-specific strings,
   so similar link-list templates from other aggregators are caught too.
2. **Reader-level guard** (`app/article/[itemId]/page.tsx`): the page applies
   the same predicate to stored content before trusting it — legacy garbage
   rows render via the scrape/excerpt path even before the cleanup runs
   (defense in depth; render layer can't be poisoned by old rows).
3. **One-time data cleanup**: SQL migration sets `content_html = NULL` and
   rewrites polluted excerpts to the title for the 31 affected rows.
   Absent-key upsert semantics (bucketing comment in `content-repo.ts`) mean
   the next fetch cycle with null contentHtml will NOT re-poison them.

## Impact Analysis

- `lib/fetchers/rss.ts` — template predicate + excerpt/content gating.
- `app/article/[itemId]/page.tsx` — render-guard using the shared predicate.
- `supabase/migrations/20260904200000_hn_template_cleanup.sql` — one-time
  data fix (31 rows).
- No schema change (nullable column already), no new deps. The 31 rows will
  show excerpt=title until the next fetch cycle, then render via the reader's
  live scrape of the real article.

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build (ISR markers unchanged).
- Method 2 (dynamic): unit-check the predicate against the 4 live garbage
  shapes; probe the fixed article URL — must render the Mullvad article body
  (scrape path), not the template; card excerpts on /rss no longer start
  with "Article URL:".
- Data: migration reports 31 rows updated; recount query returns 0.
- Call-graph reachability: grep `isMetadataTemplate` in rss.ts + article page.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~25% | Audit caught: excerpt pollution is a separate surface (cards + og:description) needing the migration to rewrite, not just null contentHtml; render-layer guard needed for rows that exist before cleanup; predicate must live in one shared place, not duplicated |
| 2 | GREEN → AUDIT | ~10% | Added: excerpt fallback to title when template detected (template text is worse than the title); migration re-derives excerpt = title only for rows matching the template (no blanket rewrite) |
| 3 | AUDIT (convergence) | 0% | Convergence — loop terminated |

## Closure

Evidence required: predicate unit-probe green, migration applied + recount 0,
article page renders scraped Mullvad body, /rss cards clean, gates green,
production probes post-deploy.

## Implementation Evidence (2026-09-04)

- Migration `20260904200000_hn_template_cleanup.sql` applied + recorded;
  recount: **0 garbage content rows, 0 polluted excerpts** (was 31/31).
- Gates: type-check + lint clean, build ✓.
- Article probe (`/article/rss_https___news_ycombinator_com_item_id_49568579`):
  template in article = **False**; Mullvad body scraped = **True** (1,591
  chars — the real blog post, rendered via the render-guard → scrape path).
  Screenshot confirms full readable article.
- Visual: before/after screenshots on record — metadata dump → full article.
- Status: `closed` — production evidence below.
- **Production (post-deploy, commit `282b062`)**: same article URL —
  template = False, Mullvad body = True (1,591 chars).
