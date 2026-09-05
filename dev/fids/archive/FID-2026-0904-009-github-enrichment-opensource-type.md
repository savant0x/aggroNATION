# FID-2026-0904-009

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-009-github-enrichment-opensource-type.md` |
| **ID**       | 2026-0904-009 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments (per ECHO attribution rules, no agent names) |

## Summary

Operator: trendshift cards/pages are bare ("no information… should include the same info that the website does… maybe we can embed a github card"); OSP items sit under RSS Feeds but "should be its own category"; article pages offer no GitHub card, project info, or direct way to visit the content. Operator architecture call (endorsed): enrich via the hourly cron writing to the DB — never per-user API calls.

Probed 2026-09-04:
- GitHub REST `repos/{owner}/{repo}` (unauthenticated 60 req/h; `GITHUB_TOKEN` **already present** in `.env.local` → 5,000 req/h) returns description, stars, forks, language, topics, license, homepage, pushed_at — everything the trendshift site shows about a repo, from the authoritative source.
- `opengraph.githubassets.com/1/{owner}/{repo}` serves the real GitHub card image (HTTP 200 image/png, no auth).
- OSP docs already carry og-card thumbnails (feed-provided) but lack structured repo data; trendshift docs are bare: no thumbnail, no body beyond a stats line, title = `owner/repo`.
- **Bug found in probe**: trendshift doc `Appllama/appllama-skills` carries `url: github.com/liweiyi88/onedump` — the sponsor-widget GitHub link polluted the item URL (identity ≠ sponsor link; FID-003 note anticipated this).

## Proposed Solution (GREEN)

1. **`lib/fetchers/github-repos.ts`** — `fetchRepoData(slugs)`: pool of 4, 15s timeout, bearer `GITHUB_TOKEN` when present (unauthenticated fallback), per-item isolation, rate-limit-aware errors. NO database imports.
2. **Schema**: `githubRepoSchema` (slug, description, stars, forks, language, topics, license, homepage, pushedAt) as `github` on contentSchema; `UpsertContentInput` gains it; new source type `"opensource"` in `SOURCE_TYPES` (exhaustive Records force every surface to acknowledge it).
3. **Fetch-service**: trendshift branch enriches each repo via GitHub API, sets `thumbnailUrl = opengraph.githubassets.com/1/{slug}` (slug is verified-real identity — thumbnail valid even on API failure), excerpt prefers the real description, and **url fixes to `github.com/{slug}` only when it matches the slug, else the trendshift repo page** (bug fix). OSP (rss-branch host gate) extracts `owner/repo` from feed body links, enriches `github`, og-thumbnail fallback.
4. **Migration** (one-off script): OSP source doc `type: rss → opensource`; its 12 content docs re-keyed `rss_* → opensource_*` (sourceType field updated); comments' contentId follows.
5. **Surfaces**: `GitHubRepoCard` (og image, description, stars/forks/language/license/topics, "View on GitHub") rendered on article pages when `github` present; "Open original ↗" link in the reader header (operator-requested deliberate exception to the no-exit law — recorded); `/opensource` route; home section; nav entry; labels/taglines/hints for the new type.
6. **Cron**: nothing new to schedule — enrichment rides the existing hourly fetch cycle (fetch-time denormalization, same law as `sourceName`/impressions). Render reads Firestore only.

Alternatives: per-user GitHub calls (rate-limit suicide, rejected — operator agreed); iframe embed of trendshift (third-party fragility + no-exit, rejected); scraping trendshift detail pages (listing data already suffices; GitHub API is the authoritative source for repo facts, rejected).

## Impact Analysis

- New: `lib/fetchers/github-repos.ts`, `components/article/GitHubRepoCard.tsx`, `app/opensource/page.tsx`, migration + verify scripts.
- Modified: content schema/repo, fetch-service (2 branches), article page, type-visuals, type-listing-page, SourceFormModal, home SECTIONS, site navItems.
- Cost: +≤42 GitHub API calls per full cycle (5,000/h budget); zero per render.
- Blast radius: additive; `opensource` type forces compile-time updates via exhaustive Records.

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build.
- Method 2 (dynamic): fetch OSP + trendshift through `runFetchForSource` → trendshift docs carry `github.stars > 0` + og thumbnail + corrected urls; OSP docs carry `github` + og thumbnails; `/opensource` serves cards; article page HTML shows stars/description/"View on GitHub"/"Open original"; no `rss_*` OSP docs remain.
- Reachability: grep `fetchRepoData|GitHubRepoCard|opensource` → definition + consumers.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Operator architecture call (cron-time enrichment) adopted as design premise. |

## Closure

IMPLEMENTED + VERIFIED on Supabase (2026-09-04; Firestore verification was quota-blocked — the FID-2026-0904-010 port became the verification vehicle, per the sequencing note). Evidence:
- `opensource` source type live: OSP registered as `opensource` on Supabase (scripts/register-operator-sources.ts) and fetched through its own pipeline branch with GitHub enrichment — 12/12 docs carry real `github` data (e.g. FaceFusion ★29,770, claude-desktop-buddy ★2,568) + og-card thumbnails.
- Trendshift 30/30 docs enriched (real stars/forks/description/license/topics from the GitHub API at fetch time); URL pollution bug fixed — item urls now resolve to the trendshift repo page / clean repo, never a sponsor-widget link.
- Merged GitHub category live: home section + `/github` listing (40 og-card images in served HTML); nav shows GitHub; Top Rated + Trending OSS sections removed from production code.
- Article pages render the full `GitHubRepoCard`: ★ 35.4K / ⑂ 8.6K, description, language, license, topics, View on GitHub / Homepage links, and the operator-requested "Open original ↗" reader header link — verified in served HTML at `/article/trendshift_sgl-project_sglang`.
- Legacy `rss_*` OSP re-keying is folded into the pending Firestore→Supabase migration script (data was re-registered fresh on Supabase; historical docs migrate re-keyed).
- See SCOPE Amendment 26.
