> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-022 — Reddit, X, and HuggingFace Fetchers

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-022-reddit-x-hf-fetchers.md` |
| **ID**       | FID-2026-0903-022 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | Operator directive: "there is no fetcher built for x, reddit, we also need to add huggingface as another source as well" |

## Summary

Three ingestion gaps. (1) Reddit sources exist but have no fetcher — every fetch fails
with "Fetcher for source type 'reddit' is not implemented yet". (2) Same for X. (3)
HuggingFace is not even a registrable source type. All three violate the product's core
promise: registered sources produce content through the pipeline, nothing registered is
silently dead.

## Requirements

1. **Reddit fetcher** — live against real reddit, zero new parse surface.
2. **X fetcher** — real implementation against the official X API v2 with a bearer
   token. No fake data ever; if the token is absent the source fails with a precise,
   actionable error message (X's ToS forbid scraping; the free syndication endpoint the
   legacy ecosystem relied on is dead — probed and confirmed).
3. **HuggingFace fetcher** — new source type `huggingface` end to end: schema, admin
   form, home section, type page, about page; daily-papers items with real upvote
   engagement metrics.
4. All three follow the established fetcher contract: fetch → normalize → rate →
   deterministic-id upsert; partial loss collected into warnings, never thrown.
5. No-exit law: reddit/x/hf items read in-site via the article reader (stored content
   first — the FID-020 order), never linked off-site.

## Design

- **Reddit**: reddit's official per-subreddit Atom feed (`/hot.rss`) was probed live and
  works (JSON endpoints are blocked to datacenter UA ranges; .rss is the supported,
  documented path). The fetcher validates the URL is a subreddit, then delegates to the
  proven FID-018 feed parser — one implementation, one sanitizer, one retry policy.
- **X**: API v2 recent-tweet search per handle (`from:<handle>`), bearer-token auth via
  `X_BEARER_TOKEN` env; real metrics from `public_metrics` (impressions→views,
  likes→likes, replies→comments); tweet text becomes title/excerpt/stored reader content.
- **HuggingFace**: `https://huggingface.co/api/daily_papers` — probe confirmed clean
  JSON with id/title/summary/authors/upvotes/publishedAt. Deterministic id from the
  arXiv paper id; upvotes feed the rating; the full abstract is stored as reader content.

## Verification Plan (AUDIT)

- Static: type-check + lint + build.
- Dynamic, against real services via the running pipeline:
  - reddit: create/repair a source → fetch → >0 items, persisted, rendered on /reddit
    and home; doc ids deterministic (re-fetch idempotent).
  - huggingface: register `https://huggingface.co/papers` → fetch → papers persisted
    with upvote-driven ratings → rendered on /huggingface + home.
  - x: with no token configured, the fetch fails with the honest configuration error
    (never a fake success, never a crash); with token absent this is the expected state.
  - no-exit: reader renders stored content for the new types; no off-site links.

## Closure

**Status: VERIFIED 2026-09-04 — 16/16 dynamic checks against real services.**

- **Reddit** — real fetch through the official `hot.rss` feed: **25 items** auto-fetched
  on create, persisted, rendered on /reddit, served by the in-site reader with zero
  off-site content links. Finding fixed along the way: reddit's Atom emits
  `<content type="html">…</content>`, which fast-xml-parser shapes as
  `{"@_type":"html","#text":…}` — the FID-018 parser now normalizes both body shapes
  (this also hardens every existing RSS source).
- **HuggingFace** — new source type end to end: 50 daily papers fetched with real
  upvote-driven ratings; rendered on /huggingface (new route) and the home section;
  reader serves the stored abstract. Deterministic ids keyed by arXiv id dedupe
  across days.
- **X** — real API v2 implementation (search/recent `from:<handle>`, bearer auth,
  impressions→views, replies→comments). Without a token the fetch fails with the exact
  configuration instruction — verified verbatim; nothing faked. Scraping was probed
  and is dead (syndication endpoint empty; ToS forbid it regardless).
- **Reader opened to all text types** (FID-019 was rss-only): `READABLE_TYPES` guard
  now serves reddit/x/huggingface docs; not-found links home generically.
- **Operator pipeline run**: not completed today — Firestore free-tier daily quota
  (RESOURCE_EXHAUSTED) was hit during the final fetch-all attempt after repeated
  verification runs. The operator's own 4 reddit + 1 x sources will populate on the
  next fetch cycle (reddit immediately; x with the precise token error until
  X_BEARER_TOKEN is set). Environment limit, not a code defect.
- Static: type-check, lint, build clean. Verify script retained as regression suite:
  `scripts/fid022-fetchers-verify.ts` (self-cleaning; requires minted token file).

## Sweep addendum (operator: "the other types are disabled such as x/reddit, sweep all and enable all types properly")

State probe (`scripts/probe-source-state.ts`) found the real situation: the reddit/x
sources were still `enabled: true` but carried **stale era errors** ("not implemented")
and 3 consecutiveErrors each — two more failures and auto-disable would have silently
switched them off. One youtube source was toggled off, one rss archived (left as the
operator filed it). Two changes shipped:

1. **Config errors no longer auto-disable** — `SourceFetchOutcome.configError` marks
   environmental failures (missing X_BEARER_TOKEN). They are recorded for the operator
   but do NOT increment `consecutiveErrors`, so a source can never be switched off for
   lacking credentials the operator must add out-of-band. `recordConfigFailure` records
   lastError only.
2. **Sweep script** (`scripts/sweep-enable-sources.ts`, idempotent, verify pass):
   re-enables every non-archived source, resets stale counters, clears stale
   "not implemented"/quota errors — and deliberately PRESERVES token-class errors,
   which are current and actionable.

**Sweep execution is BLOCKED on Firestore's daily quota (RESOURCE_EXHAUSTED)** — the
same wall as the fetch-all run; resets midnight PT. Run order afterwards: the sweep,
then "Fetch all now". The verify script prints a loud failure if anything is left
disabled, so partial execution cannot pass silently.