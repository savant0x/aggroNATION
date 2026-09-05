# SCOPE — aggroNATION rebuild

Approved scope (operator-confirmed via interactive Q&A, 2026-09-03):

## Approved work items
- [x] Fresh rebuild of aggroNATION (AI content aggregator) at workspace root
- [x] `resources/` is reference-only — old builds of the same idea, no code reuse
- [x] Framework: Next.js App Router + TypeScript strict + Tailwind + ESLint
- [x] UI: HeroUI v3 (@heroui/react + @heroui/styles) via heroui-cli (installed globally)
- [x] Backend: Firebase — Auth (email/password + Google), Firestore
- [x] Hosting: Vercel (free tier) — NOT Firebase App Hosting (requires Blaze/billing)
- [x] Scheduled content fetch: custom free solution — protected webhook + external cron
      (GitHub Actions), no Cloud Scheduler
- [x] Firebase project created via Firebase CLI
- [x] First content source: YouTube (Data API v3)

## Amendment 1 (2026-09-03): full-system build
Operator decision: build the system out fully — **mock data is rejected** (ECHO
Law 5). Home page is designed against real Firestore data. Direction: dark
"aggro neon". All complex work is FID-bound; FIDs 001–006 below cover the full
system and require operator approval before implementation.

## Amendment 2 (2026-09-03): FID approval
Operator approved all six converged FIDs. Implementation order per operator:
001 → 002 → 003 → 006 (milestone 1: data + pipeline + home), then 004 + 005
(auth + admin CRUD). ECHO IMPLEMENT phase begins; each FID verified against
its verification plan before the next starts.

## Amendment 3 (2026-09-03): FIDs 004–005 implemented
All six approved FIDs now implemented and verified (static gates + live
boundary probes). BLOCKED items requiring operator input: Firestore/Auth
happy-path verification needs service-account credentials
(FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY) — no gcloud/ADC
and no Java (emulators) available on this machine. Alternative: install Java
+ run emulators, or supply creds. Operator decides.

## Amendment 4 (2026-09-03): credentials wired, dynamic verification passed
Operator chose to wire credentials via existing firebase-cli login. Refresh
token converted to standard ADC (gcloud well-known path) — Admin SDK
authenticates without new installs. Firestore database created, API enabled,
rules+indexes deployed live. Dynamic verification: FID-002 **13/13 PASS**
(three production bugs found & fixed — see FID), FID-003 webhook+service
cycle **PASS** (CRON_SECRET generated). Firebase Auth instance requires
one-time console activation (all CLI paths exhausted — CONFIGURATION_NOT_FOUND):
console.firebase.google.com → Authentication → Get started. FID-004/005
happy-path awaits that click.

## Amendment 5 (2026-09-03): Auth activated, all six FIDs fully verified
Operator enabled Firebase Auth (Email/Password + Google) via console. Final
dynamic run `scripts/auth-crud-verify.ts`: **14/14 PASS** — password sign-in →
session exchange (real RS256 Firebase session JWT, HttpOnly/lax/7d) → identity
probe → non-admin 403 → promote claim → re-login → admin CRUD (201/409/422/
PATCH 200/soft-delete) → idempotent cleanup. FID-004/005 moved to `verified`
(boundaries + full happy path). **All approved FIDs complete.** Remaining for
the operator: YOUTUBE_API_KEY (live fetch leg), Vercel deploy + authorized
domains. Deferred items unchanged.

## Amendment 6 (2026-09-03): env rebuilt + FID-003 live leg verified
- `.env.local` was found corrupted (single malformed line, all vars lost). Rebuilt:
  Firebase web config recovered via `firebase apps:sdkconfig`, YOUTUBE_API_KEY
  preserved, fresh CRON_SECRET generated. Home page 200, webhook 401-on-no-auth
  re-confirmed.
- FID-003 live fetch leg: **PASS 6/6** (`scripts/live-fetch-verify.ts`) against
  real YouTube API + production Firestore — the last open gate. Evidence logged
  in the FID. Duplicate-source convergence hazard documented (deterministic doc
  ids; verifier is duplicate-aware and non-destructive).
- Remaining for operator: Vercel deploy + Firebase authorized domains.

## Amendment 7 (2026-09-03): deferrals revoked, admin dashboard + branding + embeds built
Operator ruled the three [DEFERRED] items below are revoked — silent deferral violates
ECHO; the work is completed instead. FIDs 007–009 written, converged, implemented, and
verified (static gates + dynamic probes against real Firebase):
- **FID-007 Embedded video playback** — youtube cards open an in-app modal player
  (iframe gated on open; non-youtube types keep outbound links). Verified live.
- **FID-008 Product branding** — default HeroUI triangle replaced with an original
  aggroNATION mark (gradient in nav, favicon.svg + ico fallback). Verified live;
  operator visual pass pending.
- **FID-009 Admin dashboard** — server-gated /admin with source CRUD table, create/
  edit modal, enable-disable, soft delete/restore, manual "Fetch all now" trigger
  (admin-gated pipeline run), conditional nav link, admin post-login redirect.
  scripts/admin-dashboard-verify.ts: 12/12 PASS vs real Auth+Firestore.
Static gates: type-check + lint + build clean. Remaining operator items unchanged:
Vercel deploy + authorized domains.

## Amendment 8 (2026-09-03): operator bug report — theme, embeds, routes, env
Operator-reported defects fixed under FIDs 010–012 (all verified, static + dynamic):
- **FID-010 Theme system** — next-themes REMOVED (its in-tree script violated React 19;
  fired on every admin router.refresh). Owned ThemeProvider (external store, no scripts);
  `<html class="dark">` server-rendered; light-theme token overrides fix invisible
  light-mode text. Admin suite re-run post-change: 12/12 PASS.
- **FID-011 In-page embeds (PRODUCT LAW: users never leave the site via content clicks)**
  — modal playback superseded by in-page expand/collapse player inside the card;
  /youtube (ISR) and /about routes built (were 404s); non-youtube cards converted to
  non-navigating; zero outbound content anchors in served HTML (only deliberate navbar
  GitHub link remains).
- **FID-012 Client env inlining** — root cause of the recurring "Firebase client
  configuration incomplete" console error: dynamic-key process.env access is not
  inlined into client bundles. Literal-key access now; values confirmed present in
  compiled chunks.
Static gates clean. Operator visual passes pending for light mode + in-page playback.

## Amendment 9 (2026-09-03): watch pages + comments (FID-013)
Operator interaction correction: play button and titles must open a dedicated
in-site watch page (embedded player, YouTube snapshot details, comments) — not
in-row playback, not popups. Built and verified:
- `/watch/{videoId}` — server ISR page: embedded player, metadata, description,
  comment section; honest not-found for unknown ids.
- Comments: new `comments` collection (Zod schema, dedicated repo, world-read /
  session-gated create / author-or-admin soft-archive), rules + composite index
  deployed live. Email local-part only in UI.
- Cards: play button AND title both link to the watch page; no-exit law intact
  (watch is on-site).
- scripts/watch-comments-verify.ts: 15/15 PASS vs real Auth+Firestore.

## Amendment 10 (2026-09-03): registration + auth navigation (FID-014)
Operator report: after logout there was no way to sign back in; no registration
existed. Built and verified:
- `/register` — email/password + display-name sign-up and Google option; session
  exchange gives full cookie persistence (7-day httpOnly Firebase session cookie,
  users/{uid} profile doc) — no new persistence code, FID-004 inherited.
- Navbar auth nav: Sign in link when signed out; user chip + Sign out when signed
  in; Admin link for admins. Replaces AdminNavLink (one identity probe, Law 13).
- SECURITY FIX: logout now revokes refresh tokens server-side (previously a copied
  cookie stayed valid up to 7 days). Caught by the verification probe.
- scripts/auth-registration-verify.ts: 8/8 PASS vs real Firebase Auth.
Operator admin account: spencerhowell84@gmail.com (claim set; takes effect on
re-sign-in).

## Amendment 11 (2026-09-03): grid layout, real counts, pagination, search, auto-fetch + bulk import (FID-015/016)
Operator batch report: 2×5 grids; lying counts ("youtube 4 items", youtube capped at 24 despite ~20 channels); dead search; input text not following theme; no auto-fetch on add; bulk paste import needed; persistence guaranteed.
- FID-015 (verified): home sections 2 rows of 5 with REAL totals (Firestore count() aggregation — home showed 867 matching /youtube and DB); /youtube cursor pagination (10/page, proven disjoint pages); /search built + navbar form wired (substring over latest 100, honest no-results state); HeroUI field vars pinned per theme so inputs follow theme flips; home switched to force-dynamic — operator-triggered fetches change data at arbitrary times and a stale landing count reads as a bug.
- FID-016 (verified, 19/19 dynamic checks): auto-fetch on source create (awaited; failure = data, real channel → 5 items fetched); POST /api/admin/sources/bulk parses Title|URL, Title–URL, Title,URL, bare URLs; per-line isolation; duplicates = skipped (idempotent re-paste); every created source asserted persisted in Firestore; "Bulk import" button + results modal in dashboard.
- Composite index for all-types query deployed live.

## Amendment 12 (2026-09-03): source type/url editing + escape hatch (FID-017)
Operator report: a source added with the wrong type (youtube selected, RSS URL
entered) created a stuck state — type edits were silently stripped by the PATCH
schema (200 with no change), archived rows had no delete control, and no hard
delete existed anywhere. Built and verified (17/17 dynamic checks):
- PATCH accepts type + url; changing either triggers an immediate re-fetch and
  returns the outcome as data (real channel → 5 items fetched on edit).
- DELETE ?hard=true permanently removes the source AND all its content items
  (batched, count returned); soft archive remains the default and restorable.
- Archived rows now show Restore AND Delete; archived delete dialog's primary
  action is permanent delete with explicit content-loss warning.
- fetch-service fails fast with a precise error for non-YouTube URLs on
  youtube-typed sources (previously a misleading channel-resolution error).
- scripts/fid017-edit-delete-verify.ts kept as the standing regression suite.

## Amendment 13 (2026-09-03): RSS fetcher shipped (FID-018)
The longest-standing deferred item is done — the "rss fetcher not implemented"
blocker the operator hit while escaping the FID-017 trap. Built and verified
(15/15 dynamic checks vs a real public feed):
- lib/fetchers/rss.ts: RSS 2.0 + Atom parsing (fast-xml-parser), per-item error
  collection, HTML-stripped excerpts, best-effort thumbnails, guid/link identity.
- Pipeline branch in fetch-service: rss → freshness-driven rating → upsert;
  retry with backoff for transient feed-host errors (a 502 during verification
  proved the need).
- Real-feed proof: 10 items fetched + persisted + schema-valid + rendered on
  home and /rss; idempotent re-fetch (identical doc-id set); hard delete cleans
  source + content; malformed feeds fail honestly as data.
- The 3 registered RSS sources fetch on the operator's next fetch cycle.
- Recorded next step (not silently dropped): in-site article reader view so the
  no-exit law covers articles, not just videos.

## Amendment 14 (2026-09-03): article reader, page size 15, about/admin fixes (FID-019)
Operator batch: rss titles not clickable (youtube fine); 15 system-wide instead
of 10; /about still listed RSS as planned; source management needs pagination.
- On-site article reader shipped: /article/{docId} fetches the source page,
  extracts the main region, sanitizes with sanitize-html (anchors unwrapped to
  text — zero off-site navigation paths; script/iframe content discarded),
  renders with comments. JS-only pages show excerpt + honest limitation note.
- Rss cards (thumbnail + title) now navigate to the reader — no-exit law
  covers articles.
- Page size 15 system-wide (home sections = 3 rows of 5; type pages; admin).
- /about lists RSS as live.
- Admin source table paginates 15/page with Prev/Next + range indicator;
  page clamps when the list shrinks.
Verified live against the operator's dev server: real article rendered
sanitized (11 paragraphs), zero outbound content anchors, 15/section,
distinct pagination pages, honest not-found states.

## Amendment 15 (2026-09-03): feed-content-first reader (FID-020)
Operator report: /article/rss_oai_arXiv_org_2609_02649v1 rendered arXiv footer
boilerplate instead of the abstract. Root cause: feed parsing was correct, but
the reader scraped the source page while the feed's own full content was thrown
away at fetch time (truncated to a 280-char excerpt). Fixed structurally:
- rss items now store the FULL feed-provided body (sanitized at fetch AND at
  render; 500k cap); arXiv's `arXiv:ID Announce Type:` prefix stripped.
- Reader order: stored feed content (instant, no remote fetch) → improved
  scrape (abstract-block patterns added) → excerpt + honest note.
- Backfilled via the real pipeline: 100/150 rss docs carry content (50 are
  link-only items that honestly store none).
- Verified: reported doc renders the real abstract, zero boilerplate, no-exit
  audit clean.

## Amendment 16 (2026-09-03): banner header, sortable sources, 20/page type pages (FID-021)
Operator batch: hero header uses public/banner.jpg with a theme-aware scrim;
type pages (/youtube, /rss, /reddit, /x) show 4 rows of 5 = 20 per page with a
back button; source management NAME/TYPE headers sort alphabetically on click
(toggle asc/desc, arrow indicator, sort-before-paginate). All verified live:
banner serves + referenced in home HTML, 20 cards on /rss, comparator
unit-probed case-insensitive, admin 307 boundary still held for anonymous.
Recorded data quirk (not silently dropped): arXiv feeds carry the same paper
under versioned and unversioned guids → duplicate docs; cross-guid dedupe is a
future FID.
Banner rev 2 (same day): the banner image carries the branding text itself, so
the hero's overlaid text (chip/h1/tagline) and the scrim were removed; a
visually-hidden h1 preserves the accessible page heading.
Banner rev 3 (same day): banner restored to natural aspect ratio (no crop) and
the hero is the banner alone — CTAs and top-rated chip removed from the hero
(nav covers those destinations; Top rated section below carries top-item info).
Banner rev 4 (same day): operator's bg.jpg pattern tiled as the full-page site
background (fixed, non-scrolling) under an ~85% black overlay — barely visible
texture beneath all content.
Banner rev 5 (same day): veil theme-tuned — 75% black in dark mode (pattern a
little more visible), 92% white in light mode (lighter-touch, clean pages).
Visual sweep (same day): sortable-column "regression" diagnosed — the comparator
was correct; three source names carried leading whitespace (" r/singularity" …),
and whitespace sorts before letters. Fixed at the boundary: source repo now trims
name/url on create and update; existing records repaired via one-off script
(scripts/repair-source-name-whitespace.ts, idempotent, 3 docs, verify-clean).
End-to-end re-verified on a fresh dev session: Name asc/desc and Type asc all
order correctly, arrows flip, sort precedes the pagination slice.

## Amendment 18 (2026-09-04): per-type branded card images (FID-2026-0904-001)
Operator provided `public/rss.jpg`, `public/x.jpg`, `public/reddit.jpg`,
`public/huggingface.jpg` (confirmed complete on disk). Cards now render the
operator's branded image per content type whenever an item has no origin
thumbnail (reddit Atom feeds carry none; X API v2 tweets expose none; HF daily
papers have none; many rss items have none) — a real thumbnail always wins.
Render-time fallback via `config/type-visuals.ts` + shared
`components/home/TypeFallbackImage.tsx` consumed by ContentCard and
YouTubeEmbed; no schema change, no DB backfill. Operator decision recorded:
fallback-when-null; huggingface.jpg supplied by operator. Letter tile remains
only for types without a branded image.

## Amendment 19 (2026-09-04): sweep executed + fetch cycle; reddit live; X token still absent
Operator report: "Fetcher for source type \"reddit\" is not implemented yet" +
X's no-token error. Diagnosis: reddit's fetcher HAS existed since FID-022 — the
reported message was stale pre-FID-022 metadata on disabled sources; X's error
is correct behavior (no X_BEARER_TOKEN in .env.local — grep-verified).
- Ran the staged sweep script after the quota reset: 1 source re-enabled, and
  after fixing TWO sweep-script bugs the script itself had (dotted-key `set(…,
  {merge:true})` silently writes literal top-level fields instead of nested
  paths — switched to `update()`; unconditional `process.exit(0)` masked verify
  failures — removed), all 11 stale counters reset + 10 stale errors cleared,
  verify 0 remaining, exit 0.
- Fetch cycle (POST-less GET /api/cron/fetch with CRON_SECRET): 23/33 OK,
  1,067 items. Reddit: r/singularity 25, r/AI_Agents 25 (real hot.rss items);
  /reddit now renders 17 cards with reddit.jpg fallbacks, 50 items indexed.
- X: all 7 sources fail with the honest config error (configError class — no
  counter increments). Requires X_BEARER_TOKEN from developer.x.com; free tier
  is POST-only so timeline reads need a paid tier — operator credential
  decision, nothing faked meanwhile.
- Honest failures recorded: 2 reddit sources hit reddit-side HTTP 429 (rate
  limit; auto-retry did not clear it — retry on a later cycle); "Google AI
  Blog" is a blog.google URL on a youtube-typed source (precise FID-017 error;
  operator should edit type to rss or fix URL).
- Operator-requested sources registered (scripts/register-operator-sources.ts,
  mirrors the admin create path; idempotent): Hacker News (hnrss.org/frontpage
  — news.ycombinator.com/rss serves HTML, probed) 20 items; HuggingFace Daily
  Papers (native fetcher) 50 items; Open Source Projects
  (opensourceprojects.dev/rss) 12 items. All fetched 0-failures on create.
  Home now renders reddit/rss/huggingface/youtube sections; the ONLY remaining
  empty state is X (Twitter), which is the honest token-gated state.
  trendshift.io has NO feed (all conventional paths 404, no link rel=alternate
  in markup) — registration honestly refused; would need a bespoke scraper
  (future FID, operator decision).

## Amendment 20 (2026-09-04): navbar redesign + banner glow (FID-2026-0904-002)
Operator: navbar "looks terrible and not AAA quality"; banner liked, "maybe
add a glow"; home sections/count fine (untouched). Clarified via Q&A: the
navbar was the offender, not the hero.
- Navbar rebuilt in the site's design language: layered blur chrome with the
  signature gradient-line hairline; brand mark in a glowing bordered tile;
  pill navigation with active-route state (aria-current) across ALL seven
  destinations (previously 3 — RSS/Reddit/X/HuggingFace pages existed but
  were unreachable from the bar); grouped actions cluster (GitHub · theme ·
  search · auth); mobile sheet restyled to match.
- Banner: `.banner-glow` accent bloom (theme-tuned, stronger in dark) +
  mirrored gradient edges; natural ratio and rev-3 "banner alone" preserved.
- Verified: static gates clean; served HTML carries all 7 nav hrefs, brand
  tile, banner glow, hairlines. Operator visual pass pending.
- Also clarified (evidence, no change needed): home RSS "missing" items are a
  freshness-competition effect — HN's rapid publishing fills the freshest-15;
  everything is on /rss (232 items). Add-source modal already exposes all 5
  types (imports SOURCE_TYPES from the schema; operator seeing fewer = stale
  browser chunk).

## Amendment 21 (2026-09-04): X removed, trendshift added, signal-bar header (FIDs 003–005)
- **FID-2026-0904-004 — X support REMOVED** (operator decision, evidence-based):
  free API tier discontinued 2026-02-06 (post-only, zero reads), Nitter-class
  RSS mirrors dead (community-confirmed), syndication endpoint already probed
  dead (FID-022), scraping violates ToS → no honest free path exists.
  `scripts/remove-x-sources.ts` soft-archived all 7 x sources (reversible;
  policy note in lastError); `lib/fetchers/x.ts` + `/x` route deleted; every
  type Record stripped (compiler-forced). Zero x content docs ever existed
  (config-error era), so no content loss.
- **FID-2026-0904-003 — trendshift scraper shipped (15/15 verify)**: new
  source type end-to-end; robots.txt-allowed structural parser (no API —
  robots disallows /api/ and that is respected); identity = anchor-text
  `owner/repo` (github links on the page belong to widgets — refine URL,
  never identity); views+bookmarks→metrics; /trendshift live with 20 cards;
  idempotent re-fetch (30=30).
- **FID-2026-0904-005 — navbar redesigned from scratch** after operator
  rejected the FID-002 revision as "still boilerplate": the signal bar — no
  chrome at all (no pills/tiles/borders), slim blur bar, lowercase wordmark +
  pulsing signal dot (reduced-motion aware), editorial uppercase links with
  underline-only active state, bare utilities. All FID-002 chrome classes
  probe-verified absent from served HTML.
- All static gates clean. Dev server on :65083 this session (3000 port state
  lost after production build). Operator visual pass pending on the header.
- **Amendment 21 addendum — admin crash from legacy x docs (observed, fixed):**
  the 7 soft-archived x docs made /admin throw ZodError (schema no longer has
  "x"; strict parseSourceDoc threw inside getAllSources). Fixed both ways:
  docs purged (restore was semantically impossible — the type no longer
  exists; zero content loss) and the repo boundary hardened — all source
  readers now skip-and-log a schema-invalid doc instead of letting one legacy
  row sink the query. Probe: 39 sources parsed, 0 thrown.

## Amendment 22 (2026-09-04): "forgot opensourceprojects" — home starvation fixed (FID-2026-0904-006)
OSP was registered, enabled, and fetched (12 docs) since the batch with HN —
what the operator saw was selection starvation: home sections took the pure
freshest-15, so minute-fresh HN (+arXiv) pushed daily-cadence sources out of
every home view. Fix: `getLatestContentDiversified` — newest 3 per source
(round-robin), global top-up, freshness-sorted; composite index on
(sourceId, archived, publishedAt) deployed live. v1 single-overfetch design
was live-rejected (45-doc window never reached OSP items) — replaced with
per-source queries (~15 reads/section, cheaper AND fairer). Verified: home
RSS section now carries all 5 sources (OSP 3 slots); /rss & /search keep
pure chronological order. Also this session: admin ZodError from legacy x
docs fixed (purge + tolerant readers, see FID-004 follow-up).

## Amendment 23 (2026-09-04): source badges on cards (FID-2026-0904-007)
Operator approved the FID-006 follow-up: the diversified sections' fairness
is now visible. `sourceName` denormalized onto content docs (schema + repo +
all 5 fetch branches) + one-off backfill (1256/1256 docs, 0 orphans, verify
pass) — chosen over render-time resolution, which would cost 39 source reads
on EVERY home render forever. Shared SourceBadge pill on thumbnails in
ContentCard/YouTubeEmbed/TypeFallbackImage (null-safe: pre-backfill docs
simply hide the badge). Verified live: home shows per-feed badges
(Trendshift/OpenAI/r/AI_Agents/arXiv cs.AI/OpenAI News…), /huggingface 20
badged cards. Gates clean.

## Amendment 25 (2026-09-04): trendshift fallback image wired
Operator supplied public/trendshift.jpg; TYPE_FALLBACK_IMAGE.trendshift set
(null placeholder removed). Verified live: /trendshift renders all 20 cards
with the branded image (fetcher sets no per-item thumbnails, so every
trendshift card takes the fallback — intended), home trendshift section
too; asset serves HTTP 200 image/jpeg. One-line config change; no other
surfaces affected (exhaustive Record made the switch compiler-checked).

## Amendment 24 (2026-09-04): OSP impressions scraper + Trending OSS section (FID-2026-0904-008)
Operator asked to scrape opensourceprojects.dev/?sort=views for ranking.
Probed honestly: that listing is client-rendered off an /api/ path robots.txt
disallows — untouchable. The ALLOWED post pages (server-rendered, `Allow: /`,
240 URLs in sitemap) carry real per-project Impressions counts. So the
outcome was delivered the honest way: `lib/fetchers/osp-impressions.ts`
(pool of 4, 15s/page, cap 24 pages) enriches OSP feed items' metrics.views at
fetch time (host-gated hook in the rss branch); ratings recompute on real
views. New `getTopByViewsForSource` + composite index #5 (deployed to
aggronation-app) power a "Trending OSS" home section (top 5, honest absence
when empty). Verified live: cycle enriched 12/12 items; ranking 78→75→71…;
home serves the section with view labels in order. Gates clean.

## Amendment 26 (2026-09-04): GitHub enrichment + opensource type + merged GitHub category — CLOSED on Supabase (FID-2026-0904-009)
FID-009 was converged but Firestore quota-blocked; the Supabase port (Amendment 27) became its verification vehicle. On the fresh Supabase DB: OSP registered as its own `opensource` type (12/12 docs enriched with real GitHub facts + og-cards: FaceFusion ★29,770 …), Trendshift 30/30 enriched (stars/forks/license/topics via the GitHub API at fetch time), the URL-pollution bug fixed, home + `/github` merged listing live (40 og-card images served), Top Rated + Trending OSS removed, article pages render the full GitHubRepoCard + "Open original ↗" (verified at `/article/trendshift_sgl-project_sglang`: ★ 35.4K / ⑂ 8.6K + description + language + license + topics + View on GitHub/Homepage). Legacy `rss_*` OSP docs re-key during the data migration (Amendment 27 pending step).

## Amendment 27 (2026-09-04): Firestore → Supabase migration — code complete, data migration pending quota reset (FID-2026-0904-010)
Operator approved the converged FID via decision Q&A: **hosted** Supabase project (created + linked: `xunlxdvlhfxokxjnxgrp`, N. Virginia; env in .env.local), admin via `app_metadata.is_admin` JWT claim, sessions via `@supabase/ssr` + middleware (silent refresh; logout revocation parity), email/password now with Google deferred to hosted config, cache 60s+purge (Amendment 28). The operator's "hit the ceiling on day 1" warning drove this. Implemented + verified:
- SQL migrations pushed (schema + RLS + read-path functions replacing the composite-index dance); `content_page` keyset pagination with (published_at, id) tiebreak.
- 3 repositories rewritten against Supabase with **identical exported signatures** — pages, fetch-service, and API routes compiled unchanged (boundary-swap architecture). jsonb merge-patch via SQL fns (audit caught that PostgREST `.update()` replaces jsonb wholesale, which would have silently dropped sibling config/metadata keys — Firestore merge semantics preserved exactly). `upsertContentBatch` shape-buckets rows so absent github/contentHtml/createdAt never clobbers stored values.
- Auth swapped end-to-end: SSR cookie session, middleware, session/logout/register(+server-assisted auto-confirm)/me routes, login+register pages, `lib/supabase/*`; `promote-admin` ported; registered users auto-confirmed at create (email verification = future hardening, recorded).
- Zero firebase imports remain in app/lib (grep gate). `lib/firebase/*` + firebase deps retained ONLY for the pending migration script.
- Dynamic verification vs the LIVE hosted DB: `scripts/supabase-verify.ts` **35/35** (incl. two jsonb-merge regressions the suite now guards); `scripts/live-auth-verify.ts` **10/10** over HTTP (register → sign-in → cookie session → non-admin 403 → promote → admin → logout revocation → cron fetch); prod build served home/`/github`/`/article` with REAL fetched data (HN 20, HF 50, OSP 12, Trendshift 30, Reddit 25; r/singularity 429 = Reddit rate limit, retries next cycle).
- **PENDING (quota-reset dependent):** `scripts/migrate-firestore-to-supabase.ts` written + dry-run-wired but Firestore reads are quota-blocked until the daily reset (midnight PT) — run it after reset, then delete lib/firebase + firebase deps/rules/indexes (the final cleanup step of this FID).

## Amendment 28 (2026-09-04): no-cache hole closed — ISR floors + write-path purge (FID-2026-0904-011)
Confirmed the operator's mental model: the cron is the writer; **page renders were the uncached reader** (~240 reads/view on home — the Firestore burn source). Content pages moved from `force-dynamic` to ISR floors (60s home/type pages, 300s article; `/admin` stays dynamic; `/watch`+`/search` already ISR) + ONE purge helper (`lib/cache/revalidate.ts`) called post-commit from every content write (cron fetch, admin fetch-now, source create/edit/delete/soft-delete, bulk import). Post-fetch freshness is instant (purge), idle traffic costs one render/minute — satisfying Amendment 15's stale-count goal without per-view DB hammering. Comments excluded from purge (client-loaded — verified). Verified against the production build; see the FID.

## Amendment 29 (2026-09-04): populate-normally decision + firebase fully removed
Operator decision after the midnight-PT reset failed to arrive: "just use the new db and populate it normally" — the Firestore history import was DROPPED (the app was only ~36h old; the new DB is the source of truth going forward). Consequently the final FID-010 cleanup ran immediately (`scripts/cleanup-remove-firebase.sh`, one-shot): deleted `lib/firebase/*`, 26 Firestore-era scripts (incl. the migration script), `firestore.rules`/`firestore.indexes.json`/`firebase.json`/`.firebaserc`/`idtoken.tmp`, uninstalled `firebase` + `firebase-admin`, stripped the firebase block from `.env.local`. Grep gate: **zero firebase matches** across app/components/config/lib/scripts. Populate-normally verified: full fetch cycle **6/6 OK** on Supabase (HN 20, HF 50, OSP 12, Trendshift 30, Reddit r/AI_Agents 25 + r/singularity 25 — its 429 cleared); hourly GitHub Actions cron (`.github/workflows/cron-fetch.yml`) hits `/api/cron/fetch` unchanged. Pagination suite hardened for real-data coexistence (optional `sourceId` scope on `content_page` + `getLatestContentPage`, migration `20260904190000`); `supabase-verify` **35/35** with live rss data present. **Open item (operator credential):** YOUTUBE_API_KEY in .env.local is rejected by the API (400 "API key not valid") — YouTube section stays empty until a valid key (YouTube Data API v3 enabled) is supplied; all channel resolution probes failed on the key, not the channels.

## Deferred (awaiting operator approval — never silently dropped)
- [REVOKED-PER-AMENDMENT-7] ~~Admin dashboard UI~~ — COMPLETED as FID-009 (verified)
- [REVOKED-PER-AMENDMENT-13] ~~RSS fetcher~~ — COMPLETED as FID-018 (verified)
- [REVOKED-PER-AMENDMENT-17] ~~Reddit / X fetchers~~ — Reddit COMPLETED as FID-022 (verified,
  official hot.rss transport); X implemented (FID-022) against the official API v2 and
  awaiting an X_BEARER_TOKEN to populate — the honest config error surfaces until then
- [DEFERRED] Content rating decay algorithm — schema designed for it, recalc job later
- [DEFERRED] Test suite — after pipeline is stable

## Amendment 17 (2026-09-04): Reddit, X, and HuggingFace fetchers (FID-022)
All three source types now run the full pipeline. Reddit fetches through reddit's
official per-subreddit Atom feed (JSON endpoints block datacenter ranges — probed);
the FID-018 parser was hardened to handle attributed body elements
(`<content type="html">`). HuggingFace is a NEW source type end to end (schema,
admin form, home section, /huggingface page) sourcing HF Daily Papers with real
upvote-driven ratings and arXiv-keyed deterministic ids. X uses the official API v2
with a bearer token (X_BEARER_TOKEN) — the credential-free syndication endpoint is
dead and scraping violates ToS, so without a token sources fail with the precise
configuration instruction; nothing is faked. The article reader now serves ALL text
types (rss/reddit/x/huggingface) per the no-exit law. Verified 16/16 against real
services; the operator's fetch-all verification was cut short by the Firestore
free-tier daily quota (resets midnight PT) — environment limit, recorded honestly.
Sweep addendum (same day): auto-disable policy fixed — configuration-class failures
(missing bearer token) record an error but no longer increment consecutiveErrors, so
sources can never be switched off for lacking credentials. Sweep script staged
(scripts/sweep-enable-sources.ts: re-enable all non-archived sources, reset stale
counters, clear stale era errors, preserve actionable config errors, verify pass);
execution queued behind the same quota reset.

## Scheduled operational checkpoint (FID-2026-0905-003 stream E)
- [ ] **~2026-09-12 — Rising re-review:** a full week of carried day/week momentum baselines will
      have accumulated by then. Re-probe the delta distribution (p50/p90/max of rating minus
      ratingDayAgo / ratingWeekAgo over active rows) and tune the 0.05 relative-momentum floor
      in `content_rising` if it under- or over-filters. Owner: agent on operator request; the
      evidence lives in the content table, no extra instrumentation needed.

## Open out-of-scope items discovered (Law 2 Additional Rule)
- [OPEN-OUT-OF-SCOPE] Workspace root is not a git repository — ECHO G2 (commit-hashed
  FID closure) unsatisfiable until `git init` (operator decision required)
- [OPEN-OUT-OF-SCOPE] `resources/*/.env*` files contain live-looking secrets
  (DATABASE_URL, YOUTUBE_API_KEY, NEXTAUTH_SECRET, JWT_SECRET, …) — rotation
  recommended; resources/ will be git-ignored to prevent accidental commits
