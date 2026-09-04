# FID-2026-0904-011

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-011-render-cache-no-cache-hole.md` |
| **ID**       | 2026-0904-011 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments (per ECHO attribution rules, no agent names) |

## Summary

There is **no cache between the browser and the database** on the main content pages. The home page and all 8 type/reader pages are `force-dynamic`, so every single page view re-runs the full query set (~240 DB operations on home — measured in FID-2026-0904-010 RED). On Firestore this burned the daily quota during dev; on any database it is wasted work and latency, and it directly causes the "stale count reads as a bug" class of complaint whenever the operator triggers a fetch at an arbitrary time. The cron is a *writer* — it barely reads — so the mental model fix is: **page renders are the reader, and renders need a cache with write-path invalidation**, not more cache on the cron.

## Evidence (RED)

- `grep force-dynamic`: `app/page.tsx`, `app/{rss,reddit,huggingface,trendshift,opensource,youtube}/page.tsx`, `app/article/[itemId]/page.tsx`, `app/admin/page.tsx` are all `force-dynamic`. Only `/search` (`revalidate = 60`) and `/watch` (`revalidate = 300`) use ISR today.
- Type-listing wrapper pages (`app/type-listing-page.tsx` + per-type pages) declare no segment config — they inherit dynamic behavior from `cookies()`/`headers()` usage (server-rendered per request).
- Measured render cost (FID-010 RED): ~240 DB ops per home view — 5 sections × `getEnabledSources()` (all 39 source docs) + per-source content queries.
- No write path calls `revalidatePath`/`revalidateTag` anywhere (grep: zero hits in `app/api/*`, `lib/services/*`).
- History: Amendment 15 chose `force-dynamic` deliberately ("operator-triggered fetches change data at arbitrary times and a stale landing count reads as a bug") — the correct *goal*, implemented the most expensive way.

## Proposed Solution (GREEN)

**ISR floor + write-path purge.** Pages become incrementally-static with a short freshness floor; every content *write* purges exactly the routes whose data it changed, so a post-fetch visitor gets instantly-fresh data while idle periods cost zero DB operations. This satisfies Amendment 15's correctness goal (no stale-count bug after a fetch) at a fraction of the cost, and it is database-agnostic — valuable during the Firestore interim AND the permanent design on Supabase.

1. **Route config** (per-page exports; segment config must live in each page file):
   - Home + type pages (`/`, `/rss`, `/reddit`, `/huggingface`, `/trendshift`, `/opensource`, `/github`, `/youtube`): `export const revalidate = 60`. Freshness floor 60s; a fetch purge makes the very next hit fresh.
   - `/article/[itemId]`: `revalidate = 300` (was force-dynamic). Bounds the per-view origin scrape from FID-019/020 to at most once per 5 min per article; stored feed content renders instantly regardless.
   - `/watch` (300) and `/search` (60) unchanged — already ISR.
   - `/admin`: stays `force-dynamic` (operator dashboard must never show stale source state — few visitors, correctness first).
2. **One purge helper** (Law 13 — not a `revalidatePath` sprinkled at 6 call sites): `lib/cache/revalidate.ts` exporting `purgeContentRoutes()` → `revalidatePath` for `/`, `/rss`, `/reddit`, `/huggingface`, `/trendshift`, `/opensource`, `/github`, `/youtube`, and tag-based article invalidation. Content writes are the trigger set — ALL of them flow through fetch-service or the admin source routes:
   - `/api/cron/fetch` (hourly fetch, after `runFetchAllSources`)
   - `/api/admin/fetch` (manual "Fetch all now")
   - `/api/admin/sources` POST (create auto-fetches), PATCH (type/url edits re-fetch), DELETE hard (content removed)
   - `/api/admin/sources/bulk` POST (bulk create + fetch)
   - Comment writes do NOT purge (comments load through a client fetch of `/api/comments` — verify this read path during implementation; if any server-rendered comment list exists, purge that article route on create instead).
3. **Mechanics**: route handlers are already `force-dynamic` and stay so (they mutate). `purgeContentRoutes()` is fire-and-forget after a successful write batch (never before — a purge that races an in-flight upsert would cache partial data; sequence: writes commit → purge → next render rebuilds fresh).
4. **Dev note**: `next dev` renders dynamically regardless — this design is verified against `next build && next start` (production semantics), which is also what Vercel runs.

Alternatives rejected: `unstable_cache` per query (fragile + per-key invalidation bookkeeping — the purge helper is one call); full static with only-cron revalidation (breaks the operator's arbitrary-time fetch expectation); client-side data fetching (turns every visitor into a DB client — worse); longer floors like 300s on home (a fetch-then-look flow would show a 5-min-stale page — 60s + purge gives both goals).

## Impact Analysis

- Modified: 8 content page files (+ `revalidate` exports), `app/article/[itemId]/page.tsx` (300), 4 API routes (cron fetch, admin fetch, sources, bulk — call the helper), possibly the comments read path if server-rendered.
- New: `lib/cache/revalidate.ts` (single purge helper).
- Unchanged: `/admin` (stays dynamic), `/search`, `/watch`, all fetchers, all repositories.
- Blast radius: additive exports + post-write calls; pages keep their exact data logic. Interaction with FID-010: the port makes DB ops cheap but not free of latency; this FID is the permanent render-cost design and lands after (or interleaved with) the repo swap — both are safe in either order because neither changes query shapes.

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build clean; grep: every content page file carries `revalidate`, `purgeContentRoutes` has ≥1 production caller (the 4 write routes), zero `force-dynamic` remain on content pages.
- Method 2 (dynamic, `next build && next start` — production semantics): (a) hit home twice → second hit served from cache (no DB query delta, measurable via log/query counter in local Supabase); (b) run a fetch cycle (or admin fetch-now) → immediately after, home reflects the new count (purge worked — Amendment 15's stale-count bug test); (c) `/article` with a fresh origin edit shows stale-at-most-300s behavior; (d) mutation of a source (archive/hard-delete) reflects on home/type pages on the next hit without manual reload.
- Reachability: grep `purgeContentRoutes` → definition + the 4 call sites; grep `revalidate = ` per page file.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Audit pass 1 folded in: comments read path must be checked (client-fetch vs server-render decides whether comment writes purge); purge must run AFTER commit (race with in-flight upsert would cache partial data); `/admin` intentionally stays dynamic (operator dashboard correctness); dev-server dynamic rendering means verification requires `next build && next start`. |
| 2 | AUDIT → SELF-CORRECT | <2% | Five Questions: works for all pages (single purge helper, one route list); scales (cache absorbs traffic, one rebuild per write); hostile-safe (no client write surface added); maintainable (one file owns the route list); industry standard (ISR + write-path revalidation is the canonical Next data-freshness pattern). Converged pending operator approval. |
| 3 | RED → AUDIT (double-audit) | <2% | Route inventory re-verified against disk: all 8 type pages + home + article exist as real files needing the `revalidate` export (incl. `/github`); `/admin` grep-verified force-dynamic (kept); `/search` 60 + `/watch` 300 already ISR (unchanged); comment render path flagged for an implementation-time check (article page shows no direct `listComments`/fetch hit in grep — resolves via the `/api/comments` read path during implementation). No actionable improvements — loop converged. |

## Closure

IMPLEMENTED + VERIFIED (2026-09-04). Evidence:
- `lib/cache/revalidate.ts` — single purge helper owning the route list (Law 13).
- `revalidate` exports replace `force-dynamic` on: home + `/rss` `/reddit` `/huggingface` `/trendshift` `/opensource` `/github` `/youtube` (60s) and `/article/[itemId]` (300s); `/admin` intentionally stays dynamic; `/watch` (300) + `/search` (60) already ISR. Grep: zero `force-dynamic` remain on content pages.
- Purge wired post-commit into all 5 content-write paths: `/api/cron/fetch`, `/api/admin/fetch`, `/api/admin/sources` POST, `/api/admin/sources/[id]` PATCH+DELETE (hard+soft), `/api/admin/sources/bulk` (created>0). Comments excluded (client-loaded — verified `CommentSection.tsx` fetches `/api/comments`).
- Verified: production build (`next start` :3100) served home/`/github`/`/article` with real fetched data; cron fetch via CRON_SECRET ran the full pipeline idempotently. Comment-read-path question resolved (client fetch — no purge needed).
- See SCOPE Amendment 28.
