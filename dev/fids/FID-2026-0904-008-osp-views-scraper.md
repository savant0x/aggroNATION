# FID-2026-0904-008

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-008-osp-views-scraper.md` |
| **ID**       | 2026-0904-008 |
| **Severity** | minor |
| **Status**   | converged |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 18–23 (per ECHO attribution rules, no agent names) |

## Summary

Operator: "Build a scraper for opensourceprojects.dev/?sort=views so home can rank trending OSS projects by views, not just their latest-discoveries feed." Probed 2026-09-04: the `?sort=views` listing is **client-rendered** ("Loading amazing projects…") and loads from an `/api/` path that robots.txt **disallows** — that URL cannot honestly be scraped. But the **individual post pages are server-rendered, robots-allowed** (`Allow: /`; only /api/, /_next/, /bookmarks blocked), and carry per-project **Impressions** counts, GitHub repo, date, and full description. The sitemap exposes **240 post URLs**. The outcome the operator asked for — home ranking trending OSS by views — is deliverable by enriching the already-registered OSP rss source's docs with real impression data from those allowed pages, then adding a views-ranked "Trending OSS" home section. Identity stays the existing feed guids (no duplicate docs).

## Evidence (RED)

- `?sort=views` SSR HTML: 35 KB, zero post links, visible text "Loading amazing projects…" (client-side data load); robots.txt `Disallow: /api/` — respected, not probed.
- Post page `…/post/388a41a1-…`: 70 KB SSR; text contains "Impressions 41", "GitHub Repo", "September 3, 2026 at 11:18 AM", full description, `github.com/anthropics/claude-desktop-buddy`.
- sitemap.xml: 240 `/post/` URLs, robots-allowed.
- Current OSP docs: `metrics.views = 0` (feed exposes no engagement) — home cannot rank them by views today; `app/page.tsx` sections are freshness-sorted only.

## Proposed Solution (GREEN)

1. **`lib/fetchers/osp-impressions.ts`** — `fetchImpressions(urls, { maxPages })`: fetch each robots-allowed post page (browser-like UA, 15s timeout), parse `Impressions\s*([\d,]+)` from tag-stripped text; concurrency pool of 4; per-item failure → skip (collected), never throw. Returns Map<url, impressions>.
2. **fetch-service enrichment hook** — in `fetchRssSource`, when `source.url` host is `opensourceprojects.dev`, before the upsert: enrich items whose url is an OSP post URL with `metrics.views = impressions` and recompute rating with real views. Cap `maxPages = 24` per cycle. Single upsert (no second pass). Documented as a deliberate, evidence-backed special case for this source's enrichment endpoint surface.
3. **Ranking query** — `content-repo.getTopByViewsForSource(sourceId, limit)`: `where sourceId == X, archived == false, orderBy metrics.views desc` (new composite index #5). OSP source resolved via `getSourceByUrl` in the page.
4. **Home** — new "Trending OSS" section (top 5 OSP items by impressions, SectionHeader → /rss) above the type sections; falls back to absent when the source has no data (honest).
5. **Index deploy** — `firestore.indexes.json` + firebase CLI (pattern proven in FID-006).

Alternatives: scraping the ?sort=views listing (client-rendered off a disallowed API — rejected); new source type duplicating feed identity (duplicates — rejected); client-side widget (no-exit/robustness — rejected).

## Impact Analysis

- New: `lib/fetchers/osp-impressions.ts`; Modified: `fetch-service.ts` (rss branch hook), `content-repo.ts` (+1 query), `app/page.tsx` (+1 section), `firestore.indexes.json`.
- Fetch cost: OSP cycle gains ≤24 page fetches (~10s at concurrency 4) — inside the 60s window.
- Data: OSP docs' `metrics.views` become real impressions on each cycle; ratings recompute honestly.
- Blast radius: additive; other sources untouched (host-gated hook).

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build.
- Method 2 (dynamic): probe — OSP docs' metrics.views > 0 after a fetch cycle; home "Trending OSS" section renders OSP items in descending impressions order; gates clean.
- Reachability: grep `fetchImpressions|getTopByViewsForSource` → definition + consumers.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Literal URL infeasible (disallowed API, client-rendered); allowed post pages deliver the outcome. |

## Closure

**Verified 2026-09-04 — all evidence captured against production data.**

- Method 1: type-check, lint, build — clean.
- Method 2: live OSP fetch cycle via `runFetchForSource` → `ok: true, fetched: 12, warnings: ["OSP impressions enriched for 12 item(s)"]`. Ranking probe (`getTopByViewsForSource`) returned 8 items in strict descending impressions order (78, 75, 71, 62, 47, 41, 34, 33). Served home HTML carries the section (heading present in SSR + RSC payload) with all 6 probe-matchable OSP titles and view labels rendered in order: 78 views → 75 views → 71 views. Composite index #5 (sourceId ASC, archived ASC, metrics.views DESC) deployed successfully to project `aggronation-app` (first deploy attempt used a wrong project id and failed honestly; corrected from `.firebaserc`).
- Reachability: `fetchImpressions` defined in `lib/fetchers/osp-impressions.ts`, consumed by `fetch-service.ts` rss branch; `getTopByViewsForSource` defined in `content-repo.ts`, consumed by `app/page.tsx`.

One-time fixes during implementation: probe harness initially called the new functions with wrong signatures (positional vs options-object) — corrected before conclusions were drawn; no product code was affected. Fetcher enrichment confirmed inside the pipeline window (~90s worst case at concurrency 4 / 24 pages, actual cycle well under it).

Status: **implemented + verified**.
