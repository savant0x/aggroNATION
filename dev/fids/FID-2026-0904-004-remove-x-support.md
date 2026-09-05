# FID-2026-0904-004

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-004-remove-x-support.md` |
| **ID**       | FID-2026-0904-004 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 18–20 (per ECHO attribution rules, no agent names) |

## Summary

Operator decision: X support must be removed unless a free, honest endpoint exists. Evidence gathered 2026-09-04: X's free API tier was **discontinued 2026-02-06** (pay-per-usage; free access is post-only — zero read endpoints), community RSS mirrors of the Nitter class are dead (r/rss, 2026-08 week), the credential-free syndication endpoint was already probed dead in FID-022, and scraping x.com violates X's ToS. No honest free path exists. Removing the source type end-to-end; removal is data-safe (soft-archive semantics) and reversible only if X changes policy (the FID history documents exactly what was cut).

## Evidence (RED)

- `.env.local` (grep-verified): no `X_BEARER_TOKEN` (9 keys, none matching); operator confirms they will not pay for API access.
- Web evidence (2026-09-04): free tier discontinued 2026-02-06 (multiple independent sources); "Nitter/XCancel is dead" (r/rss, 6 days ago).
- Code touchpoints (grep): `lib/schemas/content.ts` (`SOURCE_TYPES`), `lib/fetchers/x.ts`, `lib/services/fetch-service.ts` (branch + import), `config/type-visuals.ts`, `app/page.tsx:29` (home section), `app/type-listing-page.tsx` (labels/taglines/empty detail), `app/x/page.tsx`, `app/article/[itemId]/page.tsx:21` (reader types), `components/admin/SourceFormModal.tsx` (label + URL hint), navbar inherits removal via `config/site.ts` navItems.
- Data: 7 x-typed sources registered (probe earlier today: 5 with stale-era errors + "X verify (no token)" + "Anomaly"; one was "Google AI Blog"-style mis-type risk acknowledged); **zero x content docs exist** (every fetch failed with the config error — nothing to purge from `content`). Sources are soft-archived (reversible), never hard-deleted, without explicit operator instruction.

## Proposed Solution (GREEN)

1. **Code removal** — delete `lib/fetchers/x.ts` and `app/x/page.tsx`; strip `"x"` from `SOURCE_TYPES`, remove the fetch-service branch + import, remove x entries from `config/type-visuals.ts`, home sections, type-listing records, reader types array, admin label/hint maps, and the X navbar item in `config/site.ts`. Every `Record<SourceType, …>` stays exhaustive by construction (compiler-forced) — the removal compiles only when complete.
2. **Data migration (soft)** — one-off script `scripts/remove-x-sources.ts`: sets `archived: true, enabled: false` on every x-typed source with a `metadata.lastError` note documenting the policy removal date. Archived sources never fetch (FID-005 semantics), remain visible in the admin table (Restore available), and zero content docs exist to clean. Idempotent; prints a per-source summary.
3. **Honesty surface** — SCOPE Amendment 21 records the removal + evidence; the X navbar link and home section disappear; `/x` route 404s naturally.

Alternatives: keeping the type token-gated (operator explicitly ruled out — they will not pay); hard-deleting sources (destroys the audit trail for no benefit); proxying through third-party scrapers (ToS-forbidden content laundering — rejected on the same ToS grounds as direct scraping).

## Impact Analysis

- Deleted: `lib/fetchers/x.ts`, `app/x/page.tsx`, plus new one-off `scripts/remove-x-sources.ts` (run once, kept in repo history as migration record).
- Modified: schema, fetch-service, type-visuals, site navItems, home sections, type-listing records, article reader types, admin form maps.
- Data: 7 sources soft-archived; 0 content docs affected. Firestore `content` docs with `sourceType: "x"`: none exist (config-error state since registration).
- Blast radius: X UI surfaces vanish; all other types untouched; no route contract changes for surviving types.

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check`, `npm run lint`, `npm run build` — the exhaustive Records make any missed x site a compile error.
- Method 2 (dynamic): migration script output shows 7 archived / 0 remaining active; `grep -rn "\bx\b" app/ lib/ components/ config/` shows no production X references; served home HTML contains no "X (Twitter)" section; `/x` route gone (build output).
- Call-graph: `grep -rn "fetchUserTimeline\|XFetcherError\|X_BEARER" lib/ app/ scripts/` → zero matches post-removal.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Operator decision + market evidence; convergence same pass. |

## Closure

Implementation evidence:
- Migration: `scripts/remove-x-sources.ts` ran — archived 7 x sources (Lex Fridman, Greg Brockman, Z.ai, Tencent, deepseek_ai, X verify (no token), Anomaly), 0 active remaining, exit 0. Policy note written into each source's `metadata.lastError`.
- Deleted: `lib/fetchers/x.ts`, `app/x/page.tsx`.
- Stripped: `SOURCE_TYPES` (lib/schemas/content.ts), fetch-service branch + import, `config/type-visuals.ts`, home sections (app/page.tsx), type-listing records, reader READABLE_TYPES (app/article/[itemId]/page.tsx), admin label/hint maps (SourceFormModal, BulkImportModal), navbar navItems (config/site.ts).
- Gates: type-check PASS, lint PASS, build PASS — route list confirms /x gone.
- Dynamic (dev :65083): served home HTML contains zero "X (Twitter)" references; 0/6 type nav links point at /x.
- Reachability: `grep fetchUserTimeline|XFetcherError|X_BEARER|fetchXSource` in lib/ app/ components/ config/ → zero matches. Remaining textual hits are history records only (dev/fids, session summaries, SCOPE history) plus `scripts/fid022-fetchers-verify.ts` (the FID-022 regression suite's X checks are now obsolete by design — that script is a historical record; the standing fetcher regression for this area is scripts/trendshift-verify.ts).
- Note: pre-existing 6 tsc errors in other historical verify scripts remain as recorded earlier (scripts/ has its own tsconfig; not production code).

## Follow-up (same day): legacy x docs crashed the admin page — observed + fixed
Operator hit a ZodError on /admin: the 7 soft-archived x docs remained in
Firestore, but the schema no longer contains `"x"`, so strict `parseSourceDoc`
threw inside `getAllSources` and sank the whole dashboard load.
Two corrections:
1. **Data**: the soft-archive decision's premise ("Restore stays available")
   was void — the app can no longer represent type `"x"`, so restore was
   semantically impossible. `scripts/purge-x-sources.ts` hard-deleted all 7
   (they carried zero content docs; verify: 0 x-typed docs remain).
2. **Boundary hardening (root cause)**: `getAllSources`/`getEnabledSources`
   mapped a throwing parser over every doc — one legacy doc could always sink
   the dashboard. All four single/list readers are now tolerant: a doc that
   fails schema validation is skipped LOUDLY (console.error with doc id) and
   the query returns the valid remainder. Strict parsing itself is unchanged
   — single-doc fetches return null + log instead of throwing 500s.
Evidence: `getAllSources` → 39 sources parsed, 0 thrown (probe script vs real
Firestore, same `loadSources` call path that crashed); type set =
{huggingface, reddit, rss, trendshift, youtube}; type-check + lint PASS.
