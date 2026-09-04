# FID-018 — RSS Fetcher

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-018-rss-fetcher.md` |
| **ID**       | FID-2026-0903-018 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | Operator flow block (FID-017 repair surfaced "Fetcher for source type \"rss\" is not implemented yet"); longest-standing SCOPE deferred item |

## Summary

Three RSS sources are registered in the admin dashboard but cannot fetch — the rss branch of `fetchSourceContent` returns "not implemented". The operator hit this live while escaping the FID-017 trap. This FID ships the RSS/Atom fetcher through the same pipeline contract as youtube: fetch → Zod validation → deterministic-id upsert → metadata touch, with per-item error collection (never throw for partial loss).

## Evidence (RED)

- Operator's repair attempt returned: `Fetcher for source type "rss" is not implemented yet`.
- `lib/services/fetch-service.ts`: non-youtube sources short-circuit with the not-implemented outcome; 3 rss sources exist in Firestore with consecutiveErrors recorded.
- No XML parser in package.json; regex parsing is brittle and dishonest (Law 5) — a real parser is required.

## Proposed Solution (GREEN)

1. **Dependency**: `fast-xml-parser` (zero transitive deps, maintained, standard choice for feed parsing).
2. **`lib/fetchers/rss.ts`** — `fetchFeedItems({ url, maxItems })` → `{ items: NormalizedFeedItem[], errors: string[] }`. Handles RSS 2.0 (`rss.channel.item`) and Atom (`feed.entry`). Per item: externalId = guid || link (required — skip with reason if absent); title; excerpt = content:encoded/description HTML-stripped and sliced to 280; url = link; thumbnailUrl best-effort (media:thumbnail, enclosure image, first `<img>` in content — else null); author = dc:creator/author, fallback to feed title; publishedAt = pubDate/dc:date/updated, fallback fetch time; tags = categories. 30s abort timeout, browser-like User-Agent (many feeds 403 bare UA).
3. **Pipeline integration** — fetch-service dispatches by type: youtube → existing branch (wrong-type URL guard intact); rss → normalize + `computeRating` (views/likes/comments = 0 → freshness-driven, honest for articles) + `upsertContentBatch` + resolution-free metadata touch. reddit/x keep the honest not-implemented outcome.
4. **Dedupe note (documented, FID-002 hazard)**: deterministic doc id `rss_{sanitized guid}` means the same feed item referenced by two sources converges on one doc — same content, acceptable.
5. **Copy fix**: `/rss` empty-state no longer claims the fetcher "hasn't shipped yet".

Known next step (recorded, not silently dropped): an in-site article reader view (the no-exit law applied to articles) is its own FID-sized feature with sanitization requirements — rss cards currently render as non-navigating cards, so no law violation, but no reading surface yet either.

## Impact Analysis

- New: `lib/fetchers/rss.ts`. Modified: `lib/services/fetch-service.ts` (dispatch), `app/type-listing-page.tsx` (rss empty-state copy), `package.json` (+fast-xml-parser).
- Blast radius: fetch pipeline gains an rss branch; public pages unchanged structurally; admin unchanged.
- Quota: RSS fetching costs zero YouTube API units.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean.
- Method 2 (dynamic, real network + real Firestore): create an rss source against a real public feed (hnrss.org frontpage) via the admin API → auto-fetch returns itemsFetched > 0; content docs in Firestore with sourceType=rss, valid schema, ratings in [0,1]; home /rss section renders items; `/rss` page renders them; malformed feed → honest per-item/parse error as data; cleanup via hard delete (exercises FID-017 content cleanup on rss data).

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) Atom feeds lack guid — link is the identity fallback; (2) some feeds omit dates — fetch-time fallback keeps schema valid, freshness decays from then (honest limitation, noted in code); (3) HTML in content must be stripped server-side before excerpt (never rendered as HTML client-side). Converged. |

## Closure

**Status: VERIFIED 2026-09-03 — 15/15 dynamic checks PASS** (scripts/fid018-rss-verify.ts: real hnrss.org feed through the admin API + real Firestore + running dev server).

- Boundary: anonymous rss create → 401.
- Real feed: create → 201 with auto-fetch, **10 items fetched, error null**; content docs persisted with sourceType=rss, all valid against the domain schema, ratings in [0,1], excerpts plain text (no HTML).
- Idempotency: fetch-all re-run → identical doc-id set (10 → 10, zero dupes).
- Malformed feed: HTTP 404 → honest error returned as data (create 201, fetch error surfaced, nothing persisted).
- Public surfaces: home RSS section and /rss page both render rss doc ids.
- Cleanup: FID-017 hard delete removed source + all 10 content docs; zero orphans.
- **Defect caught during verification:** hnrss returned a transient 502 on first request → fetcher now retries transient HTTP statuses (429/502/503/504) up to 3 attempts with backoff; permanent statuses (404 etc.) still fail fast. Re-run: 15/15.
- Static: type-check, lint, build clean. `fast-xml-parser@^5.11.1` added (zero transitive deps).

Requires (outstanding): operator visual pass on the /rss page with their 3 registered feeds — their next "Fetch all now" will fill them.
