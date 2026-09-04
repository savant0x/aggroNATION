# Session Summary — 2026-09-03/04 (FIDs 016–022: pipeline completeness + fetchers)

## Scope in effect
- SCOPE.md through **Amendment 17**. Silent deferrals remain revoked (Amendment 7);
  every finding is either fixed, verified, or recorded as an explicit deferred item.
- No-exit law (FID-011) is settled product law: nothing a user clicks may lead
  off-site. All consumption is in-site (watch pages, article reader).

## What happened (chronological)

### FID-016 — Source auto-fetch + bulk import (verified)
- Creating a source fetches it immediately; PATCH of type/url re-fetches.
- Bulk paste import in admin with per-line parse results.

### FID-017 — Source edit escape hatch (verified 17/17)
- Operator hit an unescapable loop on a wrong-typed source. Four stacking defects:
  PATCH schema silently stripped `type`/`url`; wrong-type errors were misleading;
  archived rows had no delete; no permanent delete existed.
- Now: type/url first-class editable + auto re-fetch; precise wrong-type error;
  Restore AND Delete on archived rows; `DELETE ?hard=true` removes source + its
  content docs (blast radius shown in dialog). Regression script retained:
  `scripts/fid017-edit-delete-verify.ts`.

### FID-018 — RSS fetcher (verified 15/15)
- `lib/fetchers/rss.ts`: RSS 2.0 + Atom via fast-xml-parser; guid/link identity;
  transient-HTTP retry (429/502/503/504 ×3); partial loss collected, never thrown.

### FID-019 — Article reader + page sizes (verified)
- `/article/[itemId]` reader: content-first (FID-020 order), sanitized twice
  (fetch + render), anchors never survive → no-exit holds. Comments keyed by
  content id. Page size 15 system-wide (home/type pages/admin), back buttons.

### FID-020 — Feed-content-first reader (verified)
- Root cause of the arXiv "footer as article" bug: feed content was truncated to a
  280-char excerpt and thrown away; the scraper then grabbed arXiv boilerplate.
- Feeds now store the full sanitized body; arXiv metadata prefix stripped;
  scrape-fallback patterns improved (blockquote.abstract etc.).

### FID-021 — Banner/sorting/page-size (verified; sweep addendum)
- Banner: `public/banner.jpg` natural aspect ratio, ALONE in the hero (rev 3);
  `public/bg.jpg` tiled as fixed full-page background under a theme-aware veil
  (dark: 75% black, light: 92% white — rev 4/5). sr-only h1 kept for a11y/SEO.
- Type pages 20/page (4×5); admin Name/Type click-to-sort (case-insensitive,
  full list before pagination slice).
- **Sort "regression" was dirty data**: three source names had leading whitespace.
  Fixed at the boundary (repo trims name/url on create/update) + one-off repair
  script. Diagnostic note: a wedged dev-server session can skip React hydration —
  clicks are no-ops on SSR DOM; restart the server before debugging component code.

### FID-022 — Reddit, X, HuggingFace fetchers (verified 16/16) + sweep addendum
- **Reddit**: official `hot.rss` per-subreddit Atom feed (JSON endpoints block
  datacenter ranges — probed). Parser hardened: `<content type="html">` arrives as
  `{"@_type":"html","#text":…}` from fast-xml-parser — `bodyTextOf` normalizes both
  shapes. Verified: 25 real posts end-to-end.
- **HuggingFace**: NEW source type end-to-end (schema enum, admin form w/ per-type
  URL hints, home section, `/huggingface` route). HF Daily Papers API; upvotes =
  real engagement; arXiv-id-keyed deterministic ids. Verified: 50 real papers.
- **X**: official API v2 (`from:<handle>` search/recent, bearer auth,
  impressions→views, replies→comments). Syndication endpoint is DEAD (probed);
  scraping is ToS-forbidden. No token → precise honest error, nothing faked.
- **Reader serves all text types** now (rss/reddit/x/huggingface; youtube has /watch).
- **Auto-disable policy fix**: config-class failures (`configError`, e.g. missing
  X_BEARER_TOKEN) record lastError but do NOT increment consecutiveErrors — sources
  can no longer be auto-disabled for missing credentials.

## Current state (end of session)
- Dev server running on **localhost:51001** (3000 was lost to stale .next port
  state after rapid restarts; next clean start usually reclaims 3000).
- Static gates: type-check, lint, build ALL CLEAN at close.
- Sources: 34 registered. All reddit/x sources enabled but carry stale era errors
  ("not implemented") + 3 consecutiveErrors each — harmless now (fetchers exist)
  but due for the sweep.
- **BLOCKED on Firestore free-tier daily quota (RESOURCE_EXHAUSTED, resets
  midnight PT):**
  1. Sweep script staged, not yet executed:
     `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/sweep-enable-sources.ts`
     (re-enables all non-archived, resets stale counters, clears stale errors,
     preserves actionable config errors, verify pass fails loudly on partials)
  2. "Fetch all now" for the operator's 4 reddit sources (fetcher verified with
     25 items in test; their own sources need one cycle).

## Operator inputs needed (next session)
1. Run the sweep + one fetch cycle after quota reset (commands above).
2. Optional: `X_BEARER_TOKEN` in `.env.local` (developer.x.com; free tier is
   POST-only — timeline reads need a paid tier) to light up the 5 x sources.
3. Optional: decide home page size (currently 15/section; type pages 20).

## Addendum (2026-09-04, later): operator report follow-ups
- "Another next dev server" startup error: caused by an agent-started dev
  server left on :65083 (PID 5520) — killed; port 3000 free again. Agent rule
  going forward: dev servers started for probing get stopped before the
  session ends.
- Operator asked to "add" OSP + trendshift: both verified live via a pipeline
  probe (OSP 12 items, fetch OK; trendshift 34→40 items, fetch OK — 6 new).
  Nuance recorded: opensourceprojects.dev has no per-sort feed — /rss is the
  discovery stream regardless of the site's ?sort=views view; a views-ranked
  scraper would be a new FID (site is SSR + robots-allowed, pattern proven).

## Known-open items (recorded, not silently dropped)
- arXiv cross-guid dedupe (versioned vs unversioned ids → rare duplicate papers).
- Reddit ratings are freshness-only (feed exposes no engagement numbers; OAuth
  enrichment is a recorded option).
- Reddit/X/HF reader fallback for JS-only pages shows excerpt + honest note.
- Test suite still deferred (pipeline now broad enough to deserve one).
- Firestore quota headroom: verification traffic burns free-tier reads fast;
  batch verification runs accordingly.
