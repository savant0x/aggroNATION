# FID-2026-0904-023

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-023-content-platform-expansion.md` |
| **ID**       | FID-2026-0904-023 |
| **Severity** | major |
| **Status**   | converged |
| **Created**  | 2026-09-05 |
| **Author**   | Operator: "do it all" over the 13-item product review (engagement, depth, discovery, retention) |

## Summary

Twelve work streams (review item 9 "topic hubs" is folded into stream G —
github topics already live in `tags`, so `/tags/[tag]` *is* the topic
surface; building two would duplicate):

- **A Bookmarks** — `bookmarks` table (mirroring the comment-repo's
  service-client + session-enforced pattern), save button on article/watch,
  `/saved` page (session-gated).
- **B Threaded replies** — `comments.parent_id` (nullable, one display
  level; reply-to-reply flattens to its ancestor), API + CommentSection.
- **C Reactions** — `reactions` table (unique per user+item), "+" toggle on
  article/watch with live count.
- **D Related items** — `content_related` SQL fn (same type, tag overlap
  first then same-source), "Read next" on article pages.
- **E Reading time + progress bar** — word count from `contentHtml` in the
  article header; 2px scroll-progress client component.
- **F Share button** — `navigator.share` with clipboard fallback.
- **G Tag/topic pages** — `/tags/[tag]` ISR listing (`content_by_tag` fn,
  jsonb containment), clickable tag chips on cards, sitemap top tags.
- **H Rising/momentum** — `metrics.prev_rating` snapshot written each fetch
  cycle (absent → seeded to current rating on first write after this ships,
  delta 0, honest); `content_rising` SQL fn; `/rising` page. Empty until the
  second cycle — empty state says so.
- **J Repo entity pages** — `/repo/[slug]` (`/` → `--` encoding) grouping
  every `github`-blob item for one repo: card, stats, all mentions.
- **K Time machine** — repo fn for "one week ago" top items; home strip.
- **L Feed params** — `feed.xml` becomes dynamic with `s-maxage` (RSS
  readers are the audience; CDN-cached), `?type=` and `?days=` filters.
- **M PWA** — manifest + minimal service worker (static assets cache-first,
  pages network-first). No offline-reading-list yet (sequel to A).

## Evidence (RED)

- Engagement: `grep -rl "bookmark|reactions|upvote|favorite|save" components/ app/` → only a BulkImportModal false positive; comments are flat
  (`grep parent_id lib/repositories/comment-repo.ts` → 0).
- Depth: no related/read-next, no reading time, no share, no tag surface
  (`ls app/tags` → absent) — all verified in the review probes.
- Discovery: `metrics` carries no previous-rating snapshot (upsert shape in
  content-repo); no `/repo` route; nothing on the site renders "a week ago".
- Retention: `app/digest/feed.xml/route.ts` is `force-static` (no params);
  no `manifest`/service worker (`ls public/manifest*` → absent).

## Proposed Solution (GREEN)

One migration batch `20260905000000_engagement_discovery.sql`: bookmarks,
reactions, `comments.parent_id`, and the new read functions
(`content_related`, `content_by_tag`, `content_rising`, `content_repo_items`,
`content_time_machine`, plus re-created `setof content` functions are NOT
touched — none of these alter the content row shape… except none do; new
functions only, so no invalidation risk this time). Repos + API routes
follow the comment-repo service-client/session pattern exactly. Surfaces as
listed. Purity rule: all wall-clock reads (`time machine`, rising window)
live inside repo functions, never in component bodies.

## Impact Analysis

New: 1 migration, `app/{saved,rising,tags/[tag],repo/[slug]}/page.tsx`,
`app/api/{bookmarks,reactions}/route.ts`, `components/{save-button,reaction-bar,share-button,reading-progress,related-items,time-machine-strip}.tsx`,
`lib/repositories/engagement-repo.ts`, `public/manifest.webmanifest`,
`public/sw.js`. Modified: comments (repo/API/UI), fetch-service (prev_rating),
content-repo (tag/related/repo/time selectors), article + watch pages, navbar
(nav entries), sitemap, `digest/feed.xml`, ContentCard (tag chips).

## Verification Plan (AUDIT)

Per stream: gates after each batch; SQL functions probed via repo layer;
API authz probed (401 unauthenticated); pages probed for 200/honest-empty;
palette unaffected; production re-probe matrix post-deploy. Law 4 greps for
every new component/route. Rising verified across two forced fetch cycles of
one source (delta > 0 row appears).

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~15% | Audit caught: new SQL functions only — no content-shape change, so no function-invalidation repeat of FID-022's self-correct; RLS replaced by the established service-client/session pattern (comment-repo precedent, Law 11); rising seeds prev_rating=rating on first sight (delta 0) so the first cycle can't fake momentum; topic hubs folded into tag pages; feed params require dropping force-static — CDN s-maxage retained |

## Closure

`converged`. Implementation proceeds stream-by-stream; each commit
path-scoped; production matrix before `closed`.
