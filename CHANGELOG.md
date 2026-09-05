# CHANGELOG

All notable changes to aggroNATION are recorded here. FID-driven changes
cite the originating FID; routine ops (cron, infra, deps) are listed
without one. Dates are UTC.

## 2026-09-05

### Added

- **Engine badge, ingestion sparkline, digest momentum** (`FID-2026-0905-003`, `minor`): shields.io endpoint badge
  at `/api/status/badge.json` embedded in a README rewritten to the Supabase reality; inline-SVG items-per-cycle
  sparkline on `/status` (trailing 48 cycles); The Briefing's newest day gains a data-gated Momentum section
  (page + feed) that populates as the week-baseline staircase matures (~2026-09-12, the scheduled Rising
  re-review checkpoint recorded in SCOPE).

- **Status page, freshness stamps, momentum baselines, cycle alerting** (`FID-2026-0905-002`, `major`): public
  `/status` engine heartbeat + `/api/status` JSON backed by a new append-only `fetch_cycles` log written every
  cycle; "Index updated X ago · refreshes hourly" stamp on all listing pages via the shared listing header;
  Rising retuned to carried day/week momentum baselines (per-cycle deltas proved to be decay-noise — movers
  collapsed 2→0 across one live cycle; baselines refresh bounded per cycle and age into real movement);
  the purge webhook response now carries the cycle's failure count so the workflow annotates source failures.

- **Auto-freshness pipeline** (`FID-2026-0905-001`, `major`): the hourly ingestion runner now purges Vercel's ISR
  cache after every fetch via the new `GET /api/cron/purge` webhook (timing-safe Bearer auth, shared
  `isCronAuthorized` helper now owning both cron routes) — production reflects each cycle immediately instead of
  lagging by up to the revalidate window. Purge lists extended with the FID-023 discovery routes that were never
  wired (`/rising`, `/digest`, `/digest/[date]`, `/tags/[tag]`, `/repo/[slug]`). Verified end-to-end on production:
  run `33995322848` logged `Purge OK (HTTP 200)` after `5/5 sources OK, 135 items fetched`. The parity probe caught
  and fixed real `CRON_SECRET` drift between Vercel and the runner. Rising momentum confirmed live: `prev_rating`
  present on 145 rows after the first cycle on the momentum code.

- **Full-text search, OG cards, Cmd+K, ledger audit** (`FID-2026-0904-022`, `major`):
  full-text body search via `content_text` + stored `search_tsv` tsvector
  (GIN-indexed) — "mullvad" now finds the DNS article by its body;
  generated branded OG cards at `/og` wired into article/watch social
  metadata (always renders, no remote 429s); ⌘K command palette over the
  new `/api/search`; 22 Firebase-era 0903 FIDs archived with supersession
  banners, 0904 metadata drift corrected. Schema note: the migration
  invalidated the `setof content` read functions — recreated in
  `20260904230000_recreate_content_functions.sql`.
- **Slop sweep — wiring debt** (`FID-2026-0904-021`, `major`): real
  server-side search via the pinned `content_search` SQL function (the
  Firestore-era newest-100 in-page filter is gone — queries now cover the
  entire index: title/excerpt/author/source_name/tags); `middleware.ts` →
  `proxy.ts` per the Next.js 16 convention; the three parallel label maps
  consolidated into `config/pipelines.ts` (build fails on type-drift);
  valid-DOM fixes (navbar nested `ul`, auth-slot `div`-in-`ul`).
- **The Briefing + daily quality scrub** (`FID-2026-0904-018`, `FID-2026-0904-019`, `major`):
  - `/digest` — index of content-bearing days (derived from real `published_at`
    data, no fake calendar); `/digest/YYYY-MM-DD` — top 5 per category ranked by
    the stored rating snapshot; `/digest/feed.xml` — outbound RSS 2.0, one item
    per day, 14-day window. Implementation: `app/digest/*`,
    `getTopItemsForDate`/`getRecentContentDays` in `content-repo.ts`, nav +
    sitemap entries.
  - Daily junk-pattern scrub runs inside the fetch cycle (first cycle after
    UTC midnight; failure-isolated, detection-only). Implementation:
    `lib/quality/scrubber.ts`, `lib/quality/scrub-service.ts`,
    `FetchAllResult.scrubFindings`.
  - Full-RSS body backfill (`scripts/backfill-hn-bodies.ts --all`) proven:
    only 2 rss rows lack bodies (JS-only pages).

### Archived FIDs (ECHO auto-archive contract)

Closed FIDs moved from `dev/fids/` to `dev/fids/archive/` per the ECHO
auto-archive contract. Status was already `closed`; the move satisfies
the "Closed FIDs must not remain in the active `dev/fids/` directory"
requirement.

- **FID-2026-0904-009 — github-enrichment-opensource-type** (`major`):
  GitHub enrichment (stars/forks/topics) and the new `opensource` source
  type. Implementation: `lib/fetchers/github-repos.ts`,
  `lib/services/fetch-service.ts` enrichment path, `content-repo` upsert
  with bucketed `github` jsonb write.
- **FID-2026-0904-010 — supabase-migration** (`critical`): full cutover
  from Firestore to Supabase Postgres. Implementation:
  `lib/supabase/{client,admin,ssr,env}.ts`, `lib/repositories/*.ts` (rewritten),
  `supabase/migrations/*.sql`, `next.config.mjs` updates, the delete script
  + `apply-migration.ts` script. The 0903-series FIDs (001–022) that
  predate this migration reference Firebase code paths that no longer
  exist; they are still in `dev/fids/` pending a separate
  supersession-cleanup pass.
- **FID-2026-0904-011 — render-cache-no-cache-hole** (`major`): fixes
  the no-cache hole in the page-level render cache (the ISR page
  rendered for every request because of a missing `Cache-Control` chain).
  Implementation: `next.config.mjs` `Cache-Control` headers + per-page
  `dynamic`/`revalidate` reconciliation; `scripts/header-probe.ts`
  and `scripts/curl-cache-probe.ts` added for ongoing regression checks.
- **FID-2026-0904-016 — hero-live-signal** (`minor`): live-signal overlay
  on the hero banner (item count, last fetch-cycle recency, live pipeline
  count). Implementation: `components/navbar.tsx` (or hero header
  component), `lib/format/relative-time.ts` extracted util; production
  verified with commit `ce0b304`.

## Future entries

New closed FIDs append a single bullet under `## YYYY-MM-DD` in the
format above. Routine ops (cron tweaks, dependency bumps, config-only
changes) also append here without an FID reference.