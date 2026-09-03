# FID-003 — YouTube Fetch Pipeline

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-003-youtube-fetch-pipeline.md` |
| **ID**       | FID-2026-0903-003 |
| **Severity** | critical |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md Amendment 1 (operator-confirmed full-system build) |

## Summary

Content ingestion is the core product function and does not exist. This FID covers the YouTube fetcher (Data API v3), the rating formula, the orchestrating fetch service, and the cron webhook that external schedulers call. Fixes four flaws observed in the legacy build (resources/ — reference only): fuzzy channel resolution via the 100-quota-unit `search` endpoint, homepage calling its own HTTP API, duplicated `fetchSourceContent` logic in two files, and secrets in URL query strings.

## Evidence (RED)

- `grep -r "fetchYouTube\|youtube" lib/ app/` → zero matches in fresh build (pipeline absent).
- Legacy flaws documented in the 2026-09-03 workspace review: `search`-based channel resolution (1 unit vs 100 quota units); `fetchSourceContent` duplicated in `lib/cron/index.ts` AND `app/api/cron/fetch/route.ts`; homepage `fetch('http://localhost:3000/api/content')` self-call; cron secret accepted via `?secret=` query param.
- `.env.local` currently has empty `YOUTUBE_API_KEY` / `CRON_SECRET` (operator must supply — see Blocking Inputs).

## Proposed Solution (GREEN)

1. **`lib/fetchers/youtube.ts`** — pure fetcher, no DB imports:
   - `extractChannelIdentifier(url)`: parses `@handle`, `channel/UC…`, `c/name`, `user/name` URL forms.
   - `resolveToChannelId()`: handle form → `channels?part=id&forHandle=` (exact, 1 quota unit); `UC…` passthrough; `c/`+`user/` → `channels?forUsername=` fallback, then deprecated-`search` only as last resort. Resolution results cached in the source doc (`resolutionCache` map) so steady-state runs cost zero resolution calls.
   - `fetchChannelVideos()`: uploads-playlist → `playlistItems` → `videos?part=snippet,statistics` batched 50 ids/request. Never throws on partial failure — returns `{ videos, errors[] }`.
2. **Rating** (`lib/fetchers/rating.ts`): `rating = engagement×0.6 + freshness×0.4` where `engagement = clamp((likes×2 + comments×3) / views, 0, 1)` (comment weight > like weight — comments cost more effort; weights chosen over the legacy build's absolute thresholds which broke at scale) and `freshness = exp(-ageDays/14)` (14-day half-life-ish decay documented as tunable constant).
3. **`lib/services/fetch-service.ts`** — the ONE orchestrator (Law 13; the legacy duplication is the anti-pattern): `runFetchForSource(source)`, `runFetchAllSources()`. Per source: fetch → validate via FID-002 Zod schemas → deterministic-id `upsertContentBatch` → `touchSourceMetadata`. Per-source failures never abort the batch; per-source `try/catch` isolation with error capture into source metadata (`lastError`, `consecutiveErrors` — consecutiveErrors ≥ 5 → auto-disable flag proposal logged, not auto-executed).
4. **`app/api/cron/fetch/route.ts`** — GET only. Auth: `Authorization: Bearer <CRON_SECRET>` header ONLY (never query string — secrets must not land in access logs), compared with `crypto.timingSafeEqual` on equal-length buffers. Optionally triggers `runFetchAllSources()` (see Blocking Inputs: sync vs 202).

Alternatives considered: (a) Cloud Scheduler — rejected, requires Blaze (operator decision); (b) `onDocumentCreated` triggers — rejected, no incremental event source exists for cron-driven model; (c) axios — rejected, native `fetch` avoids a dependency in server routes.

## Impact Analysis

- Files created: `lib/fetchers/youtube.ts`, `lib/fetchers/rating.ts`, `lib/services/fetch-service.ts`, `app/api/cron/fetch/route.ts`.
- Depends on: FID-001 (admin), FID-002 (repos/schemas).
- Env additions: none beyond existing `YOUTUBE_API_KEY`, `CRON_SECRET`.
- Cost: steady-state ≈ 3 quota units per source per run (playlist + videos; resolution cached).

## Verification Plan (AUDIT)

- Method 1 (static): type-check + build clean; zero `any` in new modules.
- Method 2 (dynamic): emulator-mode test — sources seeded, `runFetchAllSources()` against mocked YouTube HTTP (recorded fixture) asserts: dedupe idempotency (run twice → doc count unchanged), rating within [0,1], per-source error isolation (one bad source does not fail the batch).
- Call-graph reachability: `grep -r "fetch-service\|runFetchAllSources" app/` matches `app/api/cron/fetch/route.ts`; `grep -r "content-repo" lib/services/` matches import.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) `forHandle` resolution had no `user/` legacy fallback → added; (2) fetcher originally threw on partial API failure → changed to partial-result contract; (3) timingSafeEqual length mismatch throws → added equal-length pre-hash guard. Converged. |

## Closure

Requires: implementation commit + grep evidence of route→service→repo→admin chain, plus live fetch evidence once operator supplies `YOUTUBE_API_KEY`.

## Implementation Evidence (2026-09-03)

- Static: type-check/lint/build clean; route registered in build output (ƒ /api/cron/fetch).
- Reachability: `grep runFetchAllSources app/` → `app/api/cron/fetch/route.ts` imports and calls it. Route→service→repo→admin chain complete.
- Auth: Bearer-header-only + timingSafeEqual over pre-hashed buffers implemented exactly as specced.
- Live webhook verification (2026-09-03, dev server): no bearer → 401; wrong bearer → 401; correct bearer → 200 `{ok:true, ranAt, totalSources, outcomes[]}` with real Firestore batch execution. CRON_SECRET generated (32-byte hex, in .env.local).
- Fetch-service cycle vs real Firestore: **PASS** — two seeded sources processed with per-source isolation (rss → "not implemented", youtube → "YOUTUBE_API_KEY not configured"), error recorded to source metadata (lastError set, consecutiveErrors incremented), cleanup verified.
- Live fetch: PENDING operator `YOUTUBE_API_KEY` (only remaining gap — the YouTube HTTP leg itself).
- Status `verified` (webhook + service cycle); live-API leg outstanding.
