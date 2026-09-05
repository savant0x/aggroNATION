# FID-2026-0904-003

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-003-trendshift-scraper.md` |
| **ID**       | FID-2026-0904-003 |
| **Severity** | minor |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 18–20 (per ECHO attribution rules, no agent names) |

## Summary

Operator requested https://trendshift.io/?sort=views as a content source. Trendshift publishes no RSS/Atom feed (all conventional paths 404; no `link rel=alternate` — probed 2026-09-04), so the only honest ingestion path is scraping its server-rendered listing HTML. Feasibility was probed before this FID: robots.txt explicitly allows (`Allow: /`, only /apikeys, /api, /login, /signup disallowed), the page is Next.js SSR (372 KB HTML, zero client-fetch dependency for the list), and 31 clean entries carry every needed field as plain text.

## Evidence (RED)

- Feed probe: `/rss`, `/rss.xml`, `/feed`, `/feed.xml` → 404; homepage `<head>` carries no alternate link.
- robots.txt (fetched): `User-Agent: * / Allow: / / Disallow: /apikeys/ /api/ /login /signup` — listing pages allowed; the /api/ block is respected (no API probing).
- Live HTML (fetched 2026-09-04): 53 `/repositories/{id}` links; 31 clean main-list anchors whose text is exactly `owner/repo` (sidebar/carousel anchors excluded by their svg/img content). Per-row text harvest shows: repo name, view + bookmark counts, `#tag` tokens, mention source (`r/subreddit`, x.com links), GitHub outbound link (`github.com/{owner}/{repo}?utm_source=trendshift.io`).

## Proposed Solution (GREEN)

**New source type `trendshift`, end-to-end (FID-022 pattern):**

1. **`lib/fetchers/trendshift.ts`** — `fetchTrendingRepos({ url, maxItems })` → `{ repos, errors }` (same partial-failure contract as every fetcher). Validates the URL is trendshift.io (canonicalizes bare root to `/?sort=views`), fetches with a browser-like UA + 30s timeout + transient retry (429/502/503/504 ×3). Parser anchors on structure, not styling: split the document at main-list `/repositories/{id}` anchors (text must match `owner/repo`, no svg/img inside — excludes sidebar/sponsor blocks), then harvest per row: GitHub URL, numeric counts, `#tags`, mention handle, date token. Identity: `owner/repo` from the GitHub URL (fallback: trendshift repository id) → deterministic doc ids dedupe across runs. Per-item skips are collected into `errors[]` with reasons; a page with zero parseable entries is a hard error.
2. **Schema** — `SOURCE_TYPES` gains `"trendshift"` (Zod enum is the single source of truth; admin form, labels, and Record exhaustiveness follow automatically — every `Record<SourceType, …>` site gets a compiler-forced entry).
3. **Pipeline branch** (`fetch-service`) — `fetchTrendshiftSource`: title = `owner/repo`, excerpt = stats + tags summary, stored `contentHtml` = sanitized stats/tags/mention paragraph (reader serves it in-site; no-exit law), url = GitHub link as metadata, views → views, bookmarks → likes (honest mapping — bookmark is Trendshift's real engagement signal), comments 0, publishedAt = parsed row date or fetch time (a trending list refreshes hourly; freshness rating from fetch time is honest).
4. **Surfaces** — `config/type-visuals.ts` → `null` (letter "T" tile until the operator drops a `trendshift.jpg`; one map entry later flips it); home section + `/trendshift` route + type-page records + admin URL hint (`https://trendshift.io/?sort=views`).
5. **Verification script** — `scripts/trendshift-verify.ts`: fetcher probe vs live site, source registration (idempotent), pipeline fetch, persistence + schema assertions, idempotent re-fetch, reader render check.

Alternatives: RSS bridge services (external dependency, same scraping underneath, added fragility — rejected); Trendshift API (exists per robots.txt `/api/` disallow — off-limits, respected); GitHub starred-repos API as a substitute signal (not Trendshift's data — rejected as dishonest substitution).

## Impact Analysis

- New: `lib/fetchers/trendshift.ts`, `app/trendshift/page.tsx`, `scripts/trendshift-verify.ts`.
- Modified: `lib/schemas/content.ts` (enum), `lib/services/fetch-service.ts` (branch), `config/type-visuals.ts`, `config/site.ts` (no — navItems already covered? nav labels/type pages via type-listing), `app/page.tsx` (section), `app/type-listing-page.tsx` (label/tagline/empty-detail records), `components/admin/SourceFormModal.tsx` (URL hint).
- Scraper fragility: anchored on href shapes + text content, never Tailwind class names; a layout change degrades into honest per-item errors, never fake data.
- Blast radius: additive; existing types untouched.

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check`, `npm run lint`, `npm run build`.
- Method 2 (dynamic): `scripts/trendshift-verify.ts` all checks PASS vs live site + production Firestore; `/trendshift` serves cards; reader serves a trendshift doc in-site; idempotent re-fetch.
- Call-graph reachability: `grep -rn "fetchTrendingRepos\|trendshift" lib/ app/ config/` → fetcher → fetch-service branch → route/section consumers.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Feasibility probed before FID (robots, SSR, 31 entries, field inventory). |

## Closure

Implementation evidence:
- `lib/fetchers/trendshift.ts` — structural parser (main-list anchors: `/repositories/{id}` href with exact `owner/repo` text, svg/img-free → excludes widgets), dual-count parse (views + bookmarks with date-token exclusion), #tags, mention handle, day label; canonicalization refuses non-trendshift hosts AND /api/ paths (robots.txt); transient retry 429/502/503/504; zero-parseable-page = hard error (never fake).
- Parser refinement during audit (live-probed): main-list rows carry trendshift-internal identity — the github links on the page belong to sponsor/sidebar widgets, so a row's github URL refines `url` but NEVER overrides identity (anchor text is the slug); slug dedupe case-insensitive.
- Schema: `"trendshift"` in SOURCE_TYPES; all Record sites compiler-forced (type-visuals → null/letter-T, listing labels/taglines/empty-detail, admin labels + URL hint, reader READABLE_TYPES).
- Pipeline: fetchTrendshiftSource (views→views, bookmarks→likes, deterministic `trendshift_{owner_repo}` ids, stats/tags/mention as reader content).
- Surfaces: `/trendshift` route + home section + navbar item.
- Gates: type-check PASS, lint PASS, build PASS.
- `scripts/trendshift-verify.ts`: **15/15 PASS** vs live site + production Firestore (canonicalization 3, live parse 6, registration, pipeline 2, persistence 2, idempotency 30=30).
- Dynamic UI (dev :65083): /trendshift renders 20 cards (40 article hrefs incl. RSC payload); home carries the Trendshift section.
- Two initial verify failures were honest evidence, not flukes: github-URL majority assumption wrong (fixed parser + test), slug-collision possible when overriding identity with row-adjacent links (fixed).
