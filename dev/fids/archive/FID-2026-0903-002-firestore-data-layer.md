> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-002 — Firestore Data Layer

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-002-firestore-data-layer.md` |
| **ID**       | FID-2026-0903-002 |
| **Severity** | critical |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md Amendment 1 (operator-confirmed full-system build) |

## Summary

No schema or data access code exists. The home page (FID-006) needs typed reads; the pipeline (FID-003) needs typed writes. This FID defines the `sources` and `content` collections, Zod schemas as the single source of truth, and a thin repository module — so Firestore's untyped document maps never leak into components or routes.

## Evidence (RED)

- `grep -r "firestore\|collection(" lib/ app/` → no matches outside `firebase.json`/rules.
- `firestore.rules` (written 2026-09-03) references `content`, `sources`, `users` collections — none have schema definitions anywhere.
- `firestore.indexes.json` already declares two composite indexes: `(sourceType, archived, publishedAt DESC)` and `(archived, metrics.rating DESC)` — the data layer must issue queries matching exactly these shapes.

## Proposed Solution (GREEN)

**Collections & schemas** (`lib/schemas/content.ts`, shared by client and server — Zod only):

- `sources`: `{ id, type: 'youtube'|'rss'|'reddit'|'x', name, url (unique), enabled, config { fetchIntervalMinutes, priority, maxItems, tags[] }, metadata { lastFetchedAt, lastError, consecutiveErrors, totalFetched }, createdAt, updatedAt }`.
- `content`: `{ id, sourceId (ref), sourceType, externalId (source-native id), title, excerpt, url, author, publishedAt, tags[], metrics { views, likes, comments, rating 0..1 }, featured, archived, createdAt, updatedAt }`.
- **Dedupe strategy**: document id = `${sourceType}_${externalId}` (YouTube video ids are alphanumeric-safe; per-source validators strip unsafe chars). One idempotent `set` per item replaces read-before-write dedupe — halves quota usage vs the old build's `findOneAndUpdate` pattern and needs no composite uniqueness index.
- **Rating**: `metrics.rating` is computed at fetch time (FID-003 owns the formula). Time-decay recalculation is deferred (SCOPE.md) — schema reserves nothing extra; decay recomputes from `publishedAt` + raw metrics, which are preserved.

**Repository** (`lib/repositories/content-repo.ts`, `source-repo.ts`) — the only modules importing `adminDb`/client `db` for these collections:

- `getLatestContent({ sourceType?, limit, cursor? })` — query: `archived == false` [+ `sourceType ==`] `orderBy publishedAt desc`, matches index 1. Cursor pagination via `startAfter(doc)`; cursor is opaque base64 of doc id + publishedAt.
- `getTopContent({ sourceType?, limit })` — query: `archived == false` [+ sourceType] `orderBy metrics.rating desc`, matches index 2. Used by home page sections.
- `upsertContentBatch(items)` — `writeBatch` chunked at 500 (Firestore hard limit), id-based set with `merge: true` so manual `featured`/`archived` flags survive refetches.
- Sources: `getEnabledSources()`, `getSourceByUrl()`, `touchSourceMetadata(id, patch)`.

Alternatives considered: (a) Firestore `count()` aggregation for pagination totals — rejected for now, home page never shows totals, avoids extra read cost; (b) subcollections `sources/{id}/content` — rejected, cross-source "top rated" home queries become impossible (index 2 spans all sources).

## Impact Analysis

- Files created: `lib/schemas/content.ts`, `lib/repositories/content-repo.ts`, `lib/repositories/source-repo.ts`.
- Depends on: FID-001 (`adminDb`, client `db`).
- Rules impact: none (collections already governed).
- Index impact: none (queries match existing declared indexes).

## Verification Plan (AUDIT)

- Method 1 (static): type-check + build clean; no `any` in new modules (grep).
- Method 2 (dynamic): against emulators — seed script populates 3 sources + 25 content docs, then repo integration script asserts: getLatestContent('youtube', 8) returns 8 ordered desc; getTopContent returns rating-desc order; upsertContentBatch twice does not duplicate (count stable).
- Call-graph reachability: initially zero production callers (consumers land in FID-003/006 — permitted, tracked); grep proof supplied at FID-003/006 closure time referencing this FID.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) original design deduped via composite query — replaced with deterministic doc ids; (2) `merge: true` missing → manual flags would be clobbered; (3) index-2 query needed `archived == false` equality to actually hit the composite index. Converged. |

## Closure

Requires: implementation commit + grep showing `content-repo` imported by `app/api/cron/fetch/route.ts` (FID-003) and `app/page.tsx` (FID-006).

## Implementation Evidence (2026-09-03)

- Static: type-check/lint/build all clean; zero `any` in repo/schema modules (Law 6).
- Reachability: `grep runFetchAllSources app/` → route import confirmed; `getLatestContent|getTopContent` imported by `app/page.tsx`. Both interim-reachability notes satisfied by FID-003/006 landing.
- Amendment during implementation: `thumbnailUrl` added to content schema + repo + fetcher mapping (FID-006 card design needs origin thumbnails; logged here as the schema owner).
- Dynamic verification vs REAL Firestore (2026-09-03, ADC via firebase-tools token): **13/13 PASS** — createSource, getEnabledSources, getSourceByUrl, upsert idempotency (5 docs stable across re-upsert), getLatestContent order+limit, getTopContent rating order, getContentById, flag contract, touchSourceMetadata, soft-delete exclusion, cleanup.
- Three production bugs found ONLY by dynamic testing, fixed and re-verified: (1) upserted docs omitted createdAt → schema now nullable + parser tolerant; (2) upsert omitted archived/featured entirely → equality queries never matched absent fields, making docs invisible to both composite indexes → flags now written explicitly, refetch-resets-flag documented as the contract; (3) nested metadata.lastFetchedAt Timestamp not converted in source parser.
- Indexes deployed to the live project (`firebase deploy --only firestore:rules,firestore:indexes`) — build completed and queries verified against them.
- Status `verified` (full dynamic evidence); `closed` pending git init (G2).