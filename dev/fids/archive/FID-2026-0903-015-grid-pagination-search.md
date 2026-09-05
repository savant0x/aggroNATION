> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-015 — Grid Layout, Real Counts, Pagination, Search

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-015-grid-pagination-search.md` |
| **ID**       | FID-2026-0903-015 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator batch report (2×5 grids; real counts; pagination; search; input theme) |

## Summary

Four public-surface defects: (1) grids must show **2 rows of 5** per section (currently 4); (2) counts lie — home says "youtube 4 items" (it echoes the section slice length) and /youtube caps at 24 with no pagination while the index holds hundreds; (3) search does not work (navbar box is dead markup); (4) input text doesn't follow theme flips (HeroUI field vars unpinned against our custom palette). Also a config bug: `SECTION_LIMIT=4` was a stopgap, not a spec.

## Evidence (RED)

- Operator: "for each item, we need 2 rows of 5… same for rss feeds, reddit, etc"; "no pagination, somehow youtube only shows 24 items even though i added like 20 channels"; "it says 'youtube 4 items' which is clearly wrong"; "input box text does not properly change with the theme"; "search does not work".
- `app/page.tsx` — `SECTION_LIMIT = 4`; `SectionHeader count={items.length}` (slice length, not total).
- `app/youtube/page.tsx` — `PAGE_LIMIT = 24`, single page, no cursor wiring.
- `components/navbar.tsx` — `searchInput` TextField renders with no form/action/handler.
- `styles/globals.css` — our `:root:not(.dark)` block overrides custom tokens only; HeroUI's `--foreground`, `--muted`, `--field-*` are never pinned by us (verified in `node_modules/@heroui/styles/dist/themes/default/variables.css`: `--field-foreground` resolves against `--foreground`, which our palette doesn't define per-theme).

## Proposed Solution (GREEN)

1. **2×5 grids** — `ContentGrid` gains a `columns` prop (default 5): `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`. Home sections fetch **10** items (2 rows of 5). /youtube pages of **10**.
2. **Real counts** — new repo fn `countContent({sourceType?})` using Firestore count aggregation (`query.count()` — metadata-only, no doc reads). `SectionHeader` and /youtube display the real total.
3. **Pagination (/youtube)** — repo fn `getLatestContentPage({sourceType, pageSize, cursor, direction})`: forward = `startAfter(cursorDoc)`; backward = `endBefore(cursorDoc)` + `limitToLast`. Returns `{items, nextCursor, prevCursor}` (cursors = content doc ids, opaque). Page controls: Newer/Older links; disabled when absent. Count + page indicator ("41–50 of 233").
4. **Search (/search)** — page fetches latest 100 non-archived items (new composite-free path: `getLatestContentAllTypes` needs composite `(archived ASC, publishedAt DESC)` — added to `firestore.indexes.json`), filters in-page by case-insensitive substring across title + author + tags, ordered by rating. Honest "no results" state. Limitation documented (Firestore has no native full-text; a real index service is the roadmap upgrade — Law 5 honesty, functional at current scale). Navbar search becomes a `GET /search` form (`name="q"`).
5. **Input theme pin** — `globals.css`: pin HeroUI semantic vars per theme: `.dark` → `--foreground: #f4f4f6; --muted: #8b8b98; --field-background: #121218; --field-border: #1d1d26; --field-foreground: var(--foreground); --field-placeholder: var(--muted)`; `:root:not(.dark)` → light equivalents. Inputs now deterministically follow the owned theme.

Alternatives: (a) numbered pagination via offset docs — Firestore offsets are O(n) reads; cursors are free; (b) Firestore title-prefix range search — case-sensitive and misleading; explicit in-page filter is honest about what it does; (c) third-party search service — dependency now vs documented limitation; revisit at scale.

## Impact Analysis

- Modified: `lib/repositories/content-repo.ts` (+count, +page, +all-types), `components/home/ContentGrid.tsx`, `components/home/SectionHeader.tsx` (count semantics unchanged, caller passes real count), `app/page.tsx` (limit 10 + real counts), `app/youtube/page.tsx` (pagination), `components/navbar.tsx` (search form), `styles/globals.css` (var pins), `firestore.indexes.json` (+1 composite).
- New: `app/search/page.tsx`.
- Deploy: `firebase deploy --only firestore:indexes`.
- Blast radius: home/youtube/search grids; admin and watch untouched.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; route table lists /search; index deploy success.
- Method 2 (dynamic): home HTML shows 10-card sections with real counts (grep count text vs Firestore count); /youtube ?cursor navigation returns distinct pages (probe two pages, assert disjoint doc-id sets + correct totals); /search?q=two returns matching titles; input var pins present in served CSS.
- Reachability: `grep -n "countContent" app/page.tsx`; `grep -n "getLatestContentPage" app/youtube/`; `grep -n "action=\"/search\"" components/navbar.tsx`.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) home sections without sourceType equality can't use composite index 1 → all-types query needs its own composite; (2) cursor ids must be charset-safe in URLs (content doc ids are `youtube_{id}` — safe); (3) search page marks itself noindex-worthy? No — public content, indexable. Converged. |

## Closure

**Status: VERIFIED 2026-09-03.**

- Implementation: `countContent` (content-repo.ts, count() aggregation), `getLatestContentPage` (cursor ± direction), `getLatestContentAllTypes`; `app/page.tsx` (SECTION_LIMIT=10, real counts); `app/youtube/page.tsx` (PAGE_SIZE=10, Newer/Older cursor nav); `app/search/page.tsx` (new); `components/navbar.tsx` (GET form → /search); `styles/globals.css` L41–56 (HeroUI field-var pins per theme); composite index deployed live.
- **Delta from plan:** home is `force-dynamic`, not ISR — operator-triggered fetches (auto-fetch, bulk import, Fetch-all) change data at arbitrary times, and a 5-min-stale landing count reads as a bug. Cost bounded: count() is metadata-only, grids read ≤ 11 docs.
- Static: type-check, lint, build all clean; route table lists `ƒ /search`.
- Dynamic: ground truth via direct Firestore probe — 867 youtube docs, 22 active sources (19 YT + 3 RSS). Home renders "YouTube 867 items" = /youtube "867 videos" = DB. Pagination: page 1 vs next-cursor page → 10 + 10 ids, **zero overlap**. Search `?q=paper` → "2 results" with matching card; empty /search → 200. Input theme pins present in globals.css (operator visual pass pending).
- Reachability: `countContent` in app/page.tsx + app/youtube/page.tsx; `getLatestContentPage` in app/youtube/page.tsx; search form action="/search" in navbar.
- **Follow-up caught in final sweep:** home section links to /rss, /reddit, /x were dangling (404) — the same dangling-link class as the original /youtube 404. Built all three as type-scoped listing pages sharing `app/type-listing-page.tsx` (identical pagination, counts, honest empty states explaining the fetcher isn't shipped yet); /youtube refactored onto the same component. All four routes → 200.