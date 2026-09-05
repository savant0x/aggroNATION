# FID-019 — On-Site Article Reader + Page-Size 15 + About/Admin Fixes

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-019-article-reader.md` |
| **ID**       | FID-2026-0903-019 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator batch report (rss titles not clickable; 15 system-wide; /about stale; admin pagination) |

## Summary

Four operator-reported items. (1) RSS card titles render as plain text with nowhere to go — the no-exit law forbids linking off-site, so the correct fix is the missing **in-site article reader**: a server-rendered page that fetches the article's source page, sanitizes it, and renders it on-site (with comments). (2) Page size is 10 everywhere; operator wants **15 system-wide** (home sections become 3 rows of 5). (3) `/about` still lists RSS as "planned" — stale since FID-018 shipped it. (4) Source management needs **pagination** (source count is growing past one screen).

## Evidence (RED)

- Operator: "You're unable to click the title and [view] the source material. Same way with the youtube videos" → clarified: youtube titles work; **rss** titles don't.
- `components/home/ContentCard.tsx`: non-youtube branch renders `<h3>` as plain text; comment documents the deliberate non-navigation pending a reader.
- `app/page.tsx` SECTION_LIMIT=10; `app/type-listing-page.tsx` PAGE_SIZE=10.
- `app/about/page.tsx` SOURCES: RSS `status: "planned"` (FID-018 made it live).
- `components/admin/AdminDashboard.tsx`: renders `initialSources` unpaginated.

## Proposed Solution (GREEN)

1. **Article reader** — `GET /article/[itemId]` where itemId is the content doc id (`rss_…`, charset-guarded). Server side: `getContentById` → must be sourceType=rss → fetch `item.url` (browser UA, 30s timeout, 2MB cap) → extract main region (`<article>` → `<main>`/role=main → body fallback) → **sanitize with `sanitize-html`** (allowlist; `nonTextTags` discards nav/header/footer/aside/script/style/form content; anchors excluded from allowedTags so links unwrap to text — no off-site navigation path exists in the rendered HTML) → render + `CommentSection` (comments already keyed by contentId — articles get them for free). JS-only pages yield little static HTML: if extracted text < 200 chars, show excerpt + honest "full text renders via JavaScript" note (Law 5). Force-dynamic (remote fetch per view); readability-extraction service is the recorded scaling upgrade.
2. **Rss card links** — ContentCard: rss titles + thumbnails link to `/article/{item.id}` (same pattern as youtube → watch). Other non-youtube types stay non-navigating until their readers exist.
3. **Page size 15** — SECTION_LIMIT 15, PAGE_SIZE 15, admin source pagination 15/page.
4. **/about** — RSS → live with accurate detail; detail text updated.
5. **Admin pagination** — client-side pages of 15 in AdminDashboard (sources are operator-curated and bounded; server pagination would complicate the refresh-after-mutation flow for no real scale). Prev/Next + "X–Y of N" indicator; page clamps when the list shrinks.

## Impact Analysis

- New: `app/article/[itemId]/page.tsx`, `lib/fetchers/article.ts`. Modified: `components/home/ContentCard.tsx`, `app/page.tsx`, `app/type-listing-page.tsx`, `app/about/page.tsx`, `components/admin/AdminDashboard.tsx`, `package.json` (+sanitize-html, @types).
- Blast radius: home/type pages show 15 instead of 10; new public route; admin table paginates. Watch pages, API, pipeline untouched.
- Security: third-party HTML is NEVER rendered raw — sanitize-html allowlist is the only render path; no anchors survive; img src restricted to http(s)/data.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; route table lists `/article/[itemId]`.
- Method 2 (dynamic, real feed + dev server): rss source through admin API → items persisted; GET `/article/{rss doc id}` → 200 with item title present and extracted article text rendered; no `<a href="http` in served reader HTML (no-exit audit); JS-only-page note path exercised honestly if hit; home sections contain 15 cards; /about shows RSS live; admin markup shows 15 rows + pagination controls; cleanup.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) anchors must be *unwrapped* (text kept, tag dropped), not stripped-with-content — sanitizers' nonTextTags would delete article link text; (2) article doc ids are already charset-safe (buildContentDocId) — route uses the doc id directly, no id reconstruction (which would be lossy for URL-shaped externalIds); (3) hand-rolling an HTML sanitizer is a hard no (XSS) — sanitize-html added. Converged. |

## Closure

**Status: VERIFIED 2026-09-03 — all four items live-verified against the operator's running dev server.**

- **Article reader** — real article opened via `/article/rss_https___openai_com_index_daybreak-for-frontline-defenders` → 200, 11 sanitized paragraphs rendered from the source page (extraction + allowlist sanitization working against real third-party HTML). Not-found paths verified: unknown rss doc → "Article not found" + browse link; non-rss prefix (youtube_…) → same honest 404.
- **No-exit audit** — zero outbound anchors in reader article content; the only `_blank` in the served page is the navbar GitHub icon (deliberate, documented non-content link, same as FID-011's audit).
- **Page size 15** — home sections render 15 youtube + 15 rss card links; /youtube pagination verified with distinct pages (14+15 ids — one was an item-level duplicate — zero overlap between pages).
- **/about** — RSS now listed as live with accurate detail ("Feed parsing + on-site article reading").
- **Admin pagination** — 15/page with Prev/Next + "X–Y of N"; clamp behavior unit-probed (22 sources, delete down to 2 pages while on page 3 → clamps to page 2, "16–22 of 22").
- Static: type-check, lint, build clean; `ƒ /article/[itemId]` in route table. `sanitize-html@^2.17.7` added.

Requires (outstanding): operator visual pass — click an rss title on home → article reader renders; admin table pages at 15.
