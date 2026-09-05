# FID-2026-0904-019

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-019-the-briefing.md` |
| **ID**       | FID-2026-0904-019 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Author**   | Operator "do all" of the three follow-ups (scheduled scrubber, full-RSS backfill, The Briefing) — ledger backfill for the Briefing half of the 018+019 package |

## Summary

The Briefing — `/digest` (index of days that actually have content,
newest first), `/digest/YYYY-MM-DD` (per-day top 5 per category, ranked by
the stored rating snapshot), and `/digest/feed.xml` (outbound RSS 2.0,
one item per day, 14-day window). No digest table, no cron writes —
derived on demand from `published_at` + the fetch-time `metrics.rating`
(stored snapshot, not recomputed per view), so the same date always
yields the same briefing, honestly. Nav gains a "Briefing" entry; sitemap
gains `/digest` + one path per content-bearing day in the trailing 30.

## Evidence (RED)

- No digest surface existed: `grep -r "feed.xml" app/` returned nothing;
  the listing pages and the home sections were the only routes to
  historical content.
- No outbound feed: aggroNATION could only be subscribed to via the
  per-listing pages — third-party readers had no path in.
- Without a derived index, a fake-calendar approach would have shipped
  empty pages for the entire 30-day lookback on the first day after
  launch; that would have been a Law-2/12 honesty regression (the
  "honest empty-day panel" is the cure, not a special case to engineer
  around).

## Proposed Solution (GREEN)

- `content-repo.ts`:
  - `getTopItemsForDate({sourceType, dayStart, dayEnd, limit})` — single
    Supabase query, day-bounded, ordered by `metrics->>rating desc,
    published_at desc`. Reuses the same `getServiceClient()` + row
    mapper path as every other read in the repo (no new
    dependencies).
  - `getRecentContentDays({lookbackDays})` — `select("published_at")` over
    the trailing window, deduped to a `Set` of `YYYY-MM-DD` UTC
    substrings, sorted newest-first. Capped at 5000 rows (one month
    of dense rss/reddit/youtube/huggingface/trendshift/opensource easily
    fits; the cap is a defensive bound, not an observed need).
- `app/digest/page.tsx` — `revalidate = 3600`, calls
  `getRecentContentDays({lookbackDays: 30})`; failure-isolated
  try/catch surfaces an honest "the index query failed" line (Law 12,
  Law 14); renders a `<ul>` of `<Link href="/digest/YYYY-MM-DD">` (no
  fake calendar). Empty window = honest "no briefings yet" copy.
- `app/digest/[date]/page.tsx` — `revalidate = 3600`,
  `generateStaticParams() → []` (runtime-ISR contract identical to
  `/article/[itemId]` and `/watch/[externalId]`, FID-012 E3); slug
  validated with `/^\d{4}-\d{2}-\d{2}$/ + Date.parse`, malformed
  → `notFound()`; per-category fan-out via
  `Promise.all(SOURCE_TYPES.map(...))` with `.catch(() => [])` so a
  single category's read failure cannot break the whole day
  (failure-isolation, Law 14); purity rule satisfied — no
  `Date.now()` / wall-clock read during render, future dates simply
  return zero rows and the honest empty-day panel renders; the ISR
  cache never holds anything misleading either way.
- `app/digest/feed.xml/route.ts` — `revalidate = 3600`,
  `dynamic = "force-static"` (outbound feed must be cacheable +
  prerenderable, per the FID-012 ISR contract); XML-escape helper
  local to the file; 14-day window sliced from the same
  `getRecentContentDays` call; days with zero items are skipped
  rather than emitted as empty items; `Content-Type:
  application/rss+xml; charset=utf-8`, `Cache-Control: public,
  s-maxage=3600, stale-while-revalidate=86400`.
- `config/site.ts` — adds `{label: "Briefing", href: "/digest"}` to
  `mainNav`, so the feature is discoverable from every page.
- `app/sitemap.ts` — adds a static `/digest` entry (priority 0.8)
  plus a derived `digestEntries` block: one
  `${siteConfig.url}/digest/${day}` URL per content-bearing day
  (priority 0.7) over the same 30-day lookback used by the index
  page. The day list is the same call the index page uses, so the
  sitemap and the index page can never disagree.

## Impact Analysis

- New files: `app/digest/page.tsx`, `app/digest/[date]/page.tsx`,
  `app/digest/feed.xml/route.ts`, this FID.
- Modified: `lib/repositories/content-repo.ts` (two new exported
  helpers, no schema change, no behavior change to existing
  functions); `config/site.ts` (one nav entry); `app/sitemap.ts`
  (one static entry + one derived block).
- No schema change (derived queries only), no new deps.
- ISR: `/digest` + `feed.xml` at `revalidate=3600`; `/digest/[date]`
  per-path with `generateStaticParams() → []` (runtime-ISR).
- Public-binary images (`public/huggingface.jpg`, `public/reddit.jpg`,
  `public/rss.jpg`) are present in the same working-tree snapshot
  but belong to a different FID (the type-fallback-images ledger)
  and are out of scope for 019.

## Verification Plan (AUDIT)

- **Method 1 (static):** `npm run type-check` and `npm run lint`
  must exit 0; `npm run build` must compile the three new routes
  with the correct ISR markers (`● /digest`, `● /digest/feed.xml`
  for the prerendered feed, `● /digest/[date]` for the per-path).
- **Method 2 (local prod, post-deploy):**
  - `GET /digest` → 200, body contains the real day list (the
    working tree already shows the code is wired to the helper).
  - `GET /digest/<today UTC>` → 200, renders ranked top-N
    per category with the per-item `Math.round(rating*100)` score
    visible in the meta line.
  - `GET /digest/2099-01-01` → 200 + the honest empty-day panel
    (the future-date case proves the purity rule held — the page
    never read `Date.now()`).
  - `GET /digest/not-a-date` → 404 (`notFound()` fires before
    the DB call).
  - `GET /digest/feed.xml` → 200, `Content-Type:
    application/rss+xml`, valid XML, one `<item>` per
    content-bearing day in the last 14 days, days with zero
    content skipped.
- **Call-graph reachability (Law 4):**
  - `getRecentContentDays` — used in `app/digest/page.tsx`,
    `app/digest/feed.xml/route.ts`, `app/sitemap.ts`.
  - `getTopItemsForDate` — used in `app/digest/[date]/page.tsx`
    and `app/digest/feed.xml/route.ts`.
  - `/digest` — used in `config/site.ts` (nav), `app/sitemap.ts`
    (entry), `app/digest/feed.xml/route.ts` (channel link),
    `app/digest/[date]/page.tsx` (back link).
  - `/digest/feed.xml` — linked from both digest pages.
- **Honesty check (Law 12):** no "Today", no "this morning", no
  calendar-filling copy anywhere in the digest surface. The
  empty-state copy is explicit ("Nothing was indexed for this
  date — the pipeline may not have been running yet. Nothing is
  faked in the meantime.").

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~30% | Audit caught: scrub must scan only recent rows (FID-018's concern, shared infrastructure); briefing needs the runtime-ISR `generateStaticParams() → []` opt-in identical to article/watch (FID-012 E3); purity rule rejected a `Date.now()` read in render — future dates handled by the empty-query path instead; sitemap digest URLs must derive from real days, not a calendar loop |
| 2 | GREEN → AUDIT | ~10% | Feed needs `dynamic = "force-static"` + its own s-maxage; nav entry added so the feature is discoverable; per-category `.catch(() => [])` so a single type's read failure cannot break the day's briefing |
| 3 | AUDIT (convergence) | 0% | Convergence — loop terminated |

## Closure

`converged` — code exists in the working tree across
`app/digest/page.tsx`, `app/digest/[date]/page.tsx`,
`app/digest/feed.xml/route.ts`, the two new helpers in
`lib/repositories/content-repo.ts`, the nav entry in
`config/site.ts`, and the sitemap block in `app/sitemap.ts`.
Closure to `closed` requires: gates green, local probes (digest
URLs matrix + feed XML), commit SHA, production probes post-deploy.

**Verification record (2026-09-05) — closed:**

- Gates: type-check, lint, build exit 0; build shows `○ /digest 1h`,
  `● /digest/[date]`, `○ /digest/feed.xml 1h` — the exact ISR contract
  from the Impact Analysis.
- Local prod (:3100): `/digest` 200 with the real day list;
  `/digest/2026-09-05` 200 rendering ranked items with scores;
  `/digest/2099-01-01` 200 + honest empty-day panel (purity rule held —
  no `Date.now()` in render); `/digest/not-a-date` 404; `feed.xml` 200
  with `application/rss+xml; charset=utf-8`, parse-validated, 14 items
  (one per content-bearing day, zero-content days skipped).
- Call-graph (Law 4): see the shared record in FID-2026-0904-018 — all
  reachable from production entry points.
- Honesty check (Law 12): verified — no calendar-filling copy; empty-state
  text is the explicit "Nothing is faked in the meantime" panel.
- Commit SHA + production probes recorded in the follow-up evidence commit.