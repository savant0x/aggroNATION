# FID-2026-0905-005

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-005-failure-tracker-surfacing.md` |
| **ID**       | FID-2026-0905-005 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator: "also the flag tracker is missing" |

## Summary

The auto-disable tracker (consecutive-failure counting → source auto-disabled at 5,
config-error exemption, reset-on-success) **exists in code but is invisible**: the
decision logic lives inside `server-only` fetch-service untested, `/status` renders
neither failure streaks nor enabled state, and — the real hole — **auto-disabled
sources vanish from `/status` entirely**, because only enabled sources are fetched
and therefore only they produce cycle outcomes. A source switched off by the tracker
disappears from the status page at the exact moment it needs operator attention.

## RED — evidence (probed 2026-09-05)

1. Logic present: `AUTO_DISABLE_THRESHOLD = 5`, `recordSourceFailure` increments
   `metadata.consecutiveErrors` and disables via `updateSource(enabled: false)`;
   `recordConfigFailure` deliberately does not increment (FID-022 sweep finding);
   `recordSourceSuccess` resets to 0. All inside `lib/services/fetch-service.ts`
   (`server-only`) — untestable, same structural defect the momentum decision had.
2. `grep -n "consecutiveErrors\|enabled" app/status/page.tsx` → **zero hits**: the
   status page shows per-source last-outcome only (from cycle outcomes), never the
   live tracker state.
3. Disabled sources produce no outcomes (fetch loop iterates `getEnabledSources()`)
   → they are absent from `getStatusSnapshot().sources` → invisible on /status.
4. Data model already carries everything needed: `sourceSchema.metadata
   .consecutiveErrors`, `sourceSchema.enabled`, `archived` (soft-delete) — no
   schema change required.
5. `tests/` has no coverage of the tracker (FID-004 suite predates this FID).

## GREEN — design

- **Extract** `lib/source-health.ts` (pure, Law 13 — the tested brain):
  `AUTO_DISABLE_THRESHOLD = 5` (single truth; service imports it),
  `nextConsecutiveErrors(current, kind: "fetch" | "config")` (config never
  increments), `shouldAutoDisable(consecutive)` (threshold comparison).
  fetch-service's three record functions consume these; I/O stays in the service.
- **Tests** (`tests/source-health.test.ts`): increment-on-fetch; config exemption
  (stays flat); threshold boundary (4 → no disable, 5 → disable, 6 → disable);
  current=0 first failure; negative/invalid current clamped defensively.
- **/status surfacing** (page-level join, cycle-repo untouched):
  - Load `getAllSources()` (archived=false) alongside the snapshot.
  - Sources table gains **Streak** (consecutiveErrors, amber when >0) and merges
    live tracker state with the historical outcome row; sources with no cycle
    outcome still render (streak/state only).
  - New **"Auto-disabled"** callout section: sources with `enabled=false` —
    red-accented, explaining the 5-streak policy and how to re-enable (admin
    dashboard). Renders only when non-empty (honest absence).
- No API/badge contract change (they describe the engine cycle, not source state).

## Trade-offs

- `/status` now reads `sources` per render (ISR 60s, ~5 rows) — negligible, and the
  join lives in the page (presentation concern), keeping cycle-repo log-pure.

## AUDIT — verification plan

- **Static:** gates exit 0.
- **Law 4:** `nextConsecutiveErrors`/`shouldAutoDisable` have exactly 2 callers each
  (fetch-service + test); `AUTO_DISABLE_THRESHOLD` imported by fetch-service (old
  constant deleted — no duplicate truth).
- **Runtime (local :3100):** /status renders streak column; a source with streak >0
  shows amber; an auto-disabled source appears in the callout (verify via a temp
  metadata patch on a scratch source, then revert — no fake data committed).
- **Tests:** new suite green; mutation spot-check (threshold 5 → 6) flips a test.

## Production incident found & fixed during verification (2026-09-05)

The verification probe (real DB toggle of a source's enabled flag) revealed the live tracker had
**auto-disabled all 14 YouTube sources**. Root cause chain: the GH Actions runner never received
`YOUTUBE_API_KEY` — the repo secret existed but `cron-fetch.yml` never mapped it into the job env — so every
hourly cycle failed all YouTube sources as config-errors; the tracker then did exactly its job (5 streak →
disable). The entire YouTube category had been silently dead in the engine since the disable cascade (while the
API route worked fine locally, masking it).

Fixes (all evidence-verified):
1. `cron-fetch.yml` now maps `YOUTUBE_API_KEY: secrets.YOUTUBE_API_KEY` (commit `27a4377`).
2. All 14 sources re-enabled, streaks reset (DB-probed: 0 disabled/streaking after the next cycle).
3. End-to-end proof: dispatched run `33999637572` → **19/19 sources OK, 837 items fetched, Purge OK (HTTP 200)**;
   YouTube index at 737 items.

Note: the config-error exemption (FID-022) did not fire because the runner's missing-key condition presents as a
fetch-class error inside the YouTube fetcher — a deeper classification question flagged for the next review, but
irrelevant once the mapping was fixed (sources heal on success; streaks reset).

## Closure evidence

- **Static:** type-check, lint, build all exit 0.
- **Tests:** 62/62 green (source-health suite: increment, config exemption, threshold boundary, clamp, and an
  absolute tripwire pinning `AUTO_DISABLE_THRESHOLD === 5`). Mutation check: threshold 5→6 → **1 fail** → revert
  green. (An earlier relative-style assertion was a tautology and did NOT catch the mutation — rewritten as an
  absolute pin; recorded honestly.)
- **/status:** merged live-tracker + cycle-log rows verified via a real DB toggle probe (enable=false,
  streak=7 → disabled badge + Auto-disabled callout rendered; restored after). The initial render-vs-cache
  confusion was ISR staleness — subsequent probe after the revalidate window confirmed both states.
- **Law 4:** `nextConsecutiveErrors`/`shouldAutoDisable` → 2 callers each (fetch-service + tests);
  `AUTO_DISABLE_THRESHOLD` single truth in `lib/source-health.ts` (service constant deleted).
- **Runtime:** production engine run `33999637572` completed 19/19 with the purge step OK.
