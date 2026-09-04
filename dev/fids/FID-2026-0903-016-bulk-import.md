# FID-016 — Source Auto-Fetch + Bulk Import

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-016-bulk-import.md` |
| **ID**       | FID-2026-0903-016 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator batch report (auto-fetch on add; bulk paste import; persistence guaranteed) |

## Summary

Two admin-pipeline gaps. (1) Adding a source doesn't fetch it — new channels only appear after the next cron run, so the operator sees an empty feed with no feedback. (2) Adding 20 channels one-modal-at-a-time is impractical; the operator needs a bulk paste box ("paste in a bunch of links and their title, auto-parse, fetch and update"). Persistence is already structural — `createSource` writes straight to Firestore — but the operator explicitly requires it verified, so the bulk path's per-line DB outcomes are reported and asserted.

## Evidence (RED)

- Operator: "when you add a source, it should auto fetch"; "we need a bulk import feature where i can simply paste in a bunch of links and their title and it'll auto-parse, fetch and update the site. Needs to ensure persistance, so anytime a source is added it goes in the db."
- `app/api/admin/sources/route.ts` POST — creates only; no fetch trigger.
- No bulk endpoint exists; `SourceFormModal` is single-source only.
- Persistence: `lib/repositories/source-repo.ts` `createSource` → `ref.set(docData)` (awaited, direct write — single-source path already durable; bulk inherits via the same repo).

## Proposed Solution (GREEN)

1. **Auto-fetch on create** — after 201 in POST `/api/admin/sources`, fire `runFetchForSource(source)` **awaited with a bounded outcome** (per-source isolation already in fetch-service; failures recorded to source metadata and returned as outcome data, never thrown). Response body gains `fetch: { ran: true, itemsFetched, error }`. Rationale for awaiting (not fire-and-forget): serverless kills background work after response; the operator wants the feed filled *now*. Cost: one extra YouTube resolution+playlist+details cycle (~3 quota units, resolution cached thereafter).
2. **Bulk import API** — `POST /api/admin/sources/bulk`: body `{ text: string, defaults: { type?: SourceType, fetchIntervalMinutes?, maxItems? } }`. Parse: split lines; per line, patterns tried in order — `Title | URL`, `Title – URL` (en/em dash), `Title , URL`, bare URL (title = channel handle or "Untitled"); URL validated with `z.string().url()`; YouTube URLs classified by `extractChannelIdentifier` (reused from the fetcher — single parsing truth, Law 13). Output per line: `{ line, ok, sourceId?, error? }`. For each ok line: duplicate-URL check (existing → `skipped` with existing id, not an error), else `createSource` (persistence via the awaited repo write) → `runFetchForSource` → outcome recorded. Whole thing bounded by `maxDuration = 300`; per-line isolation (one bad line never aborts the batch); summary `{ created, skipped, failed, results[] }` (200 even with partial failures — failures are data).
3. **Bulk import UI** — `components/admin/BulkImportModal.tsx` (Modal, same pattern as existing): textarea (paste), optional defaults (type select, interval), submit → results table inside the modal (per line: ✓ created n items / ↷ skipped duplicate / ✗ error), then `router.refresh()`.
4. **Dashboard wiring** — "Bulk import" button next to "+ Add source".

Alternatives: (a) CSV upload — pasting is the operator's stated workflow; CSV parsing adds format friction, not value; (b) fire-and-forget fetch — serverless background work is best-effort only; awaiting gives honest outcomes; (c) bulk endpoint creating sources without fetching (defer to cron) — violates the operator's "auto-parse, fetch and update" explicitly.

## Impact Analysis

- New: `app/api/admin/sources/bulk/route.ts`, `components/admin/BulkImportModal.tsx`. Modified: `app/api/admin/sources/route.ts` (+auto-fetch), `components/admin/AdminDashboard.tsx` (+button, +modal), `components/admin/SourceFormModal.tsx` (no change — create already returns source).
- Reused: `extractChannelIdentifier`, `runFetchForSource` (exported from fetch-service), `createSource`.
- Quota note: bulk import of N new YouTube channels ≈ 3N units — fine vs 10k/day.
- Blast radius: admin-only routes/UI. Public pages untouched.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; route table lists `/api/admin/sources/bulk`.
- Method 2 (dynamic, real Firebase + dev server): single create → response contains `fetch.ran: true` with real itemsFetched > 0 (operator's live key); bulk with mixed lines (2 valid + 1 duplicate + 1 malformed) → `{created: 2, skipped: 1, failed: 1}` + per-line results; **persistence proof**: post-bulk `getAllSources()` contains every created id (script asserts); outcomes recorded. Cleanup of seeded sources.
- Reachability: `grep -n "runFetchForSource" app/api/admin/sources/route.ts`; `grep -n "BulkImportModal" components/admin/AdminDashboard.tsx`.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) awaiting fetch inside POST needs maxDuration ≥ 60 per source; bulk bounded at 300s total with per-line time noted in results; (2) duplicate handling: report as `skipped` (idempotent re-runs of a paste are a feature); (3) `runFetchForSource` must be exported (it was module-private — minimal export, same behavior). Converged. |

## Closure

**Status: VERIFIED 2026-09-03 — 19/19 dynamic checks PASS** (scripts/fid016-bulk-verify.ts against real Firebase Auth + Firestore and the running dev server).

- Boundaries: unauthenticated single create → 401; unauthenticated bulk → 401.
- Auto-fetch: single create → 201 + `fetch.ran: true`; fake channel → failure returned as data (`Could not resolve channel id…`, 0 items, never thrown); **positive leg: real channel → 5 items fetched, error null** (mechanism proven both ways).
- Persistence: created source doc readable back from Firestore by id; bulk A + B readable by URL.
- Bulk: `{created: 2, skipped: 1, failed: 1}`; titled line kept its title; bare URL derived a name (`fid-016-bulk-b`); re-paste → `skipped` with existing sourceId; garbage line → per-line error message; summary 200 with partial failures as data.
- Duplicate single create → 409.
- Cleanup: only script-seeded docs removed (marker-based); 5 orphaned content docs from the positive leg removed via targeted author+sourceId probe; verify script kept as the standing regression suite for this FID.
- Static: type-check, lint, build clean; route table lists `ƒ /api/admin/sources/bulk`.
- Reachability: `runFetchForSource` in app/api/admin/sources/route.ts + bulk route; `BulkImportModal` wired in AdminDashboard ("Bulk import" button).
