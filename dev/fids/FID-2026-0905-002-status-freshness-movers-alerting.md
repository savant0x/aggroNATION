# FID-2026-0905-002

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-002-status-freshness-movers-alerting.md` |
| **ID**       | FID-2026-0905-002 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator approved all four follow-ups: /status health page, listing freshness stamps, Rising tuning, engine-failure alerting |

## Summary

Four streams making the engine's health **visible** and Rising **honest**:

- **A. Cycle persistence + /status health page** — fetch outcomes currently exist only in workflow logs (probed: zero `insert` calls in `fetch-service.ts`). A new `fetch_cycles` log table records every cycle; a public `/status` page renders the heartbeat (last cycle, per-source OK/FAIL, items) and `/api/status` exposes the same snapshot as JSON for badge probes.
- **B. "Index updated X ago" on listings** — one scalar query (`max(updated_at)`), rendered by the shared `TypeListingPage` so all 20+ listing route shapes get it from one place.
- **C. Rising tuning** — evidence: `content_rising(168,100)` returns **2 rows**; the only real mover (anthropics/skills, +4.4%) drowns because ranking is absolute-delta and coverage is still partial (154/1078 rows carry `prev_rating`). Tuned to relative momentum with a floor; the Rising page gains a "biggest moves this week" section; a threshold re-review is scheduled after 7 days of full coverage.
- **D. Alerting** — the workflow's failure email stays; the purge webhook response now carries the just-finished cycle's health, and the workflow annotates (`::warning::`) when the cycle it just ran reported source failures.

## RED — evidence (all probed 2026-09-05)

1. **Outcomes are not persisted.** `grep -n "insert" lib/services/fetch-service.ts` → only upserts of content. `FetchAllResult.outcomes` dies with the process; workflow logs are the only record. A status page needs a record.
2. **`/rising` is structurally starved.** Live: `content_rising(24,10)` → 0 rows; `content_rising(168,100)` → 2 rows. Delta distribution over 154 prev_rating rows: max 0.0449, p90 0.0001, sampled deltas negative (ratings time-decay each cycle — decay cannot fake positive movers). Absolute-delta ranking + tiny coverage = empty view despite real movers existing (trendshift anthropics/skills +0.044, magnitudedev/magnitude +0.029).
3. **zod strips momentum data.** `contentMetricsSchema` (lib/schemas/content.ts:74–81) declares views/likes/comments/rating only — `contentSchema.parse` strips `prev_rating` from every read row, so no TSX can display deltas even where stored.
4. **Listings have no freshness line.** `TypeListingPage` header renders label/tagline/toggle only; `relativeTime()` util exists (lib/format/relative-time.ts) and is already used by home/about for exactly this purpose.
5. **Join key verified:** `content.source_id` matches `sources.id` for 1078/1078 rows; 5 enabled sources (trendshift, reddit, huggingface, opensource, rss). Per-source status does not need a new FK — the data graph already connects.
6. **Alert surface:** workflow already fails + emails on step failure; the purge step (FID-2026-0905-001) runs `always()` and is the natural place to surface cycle health from the response body.

## GREEN — design

### Stream A — cycle record + status surfaces

- Migration `20260906000000_fetch_cycles.sql`:
  `fetch_cycles` (append-only log): `id bigint generated always as identity primary key` — deliberate deviation from the text-PK entity convention (bookmarks/comments): this is a log with no natural key; identity gives honest ordering. Columns: `ran_at timestamptz not null`, `total_sources/succeeded/failed/items_fetched int`, `outcomes jsonb not null` (array of `{sourceId, sourceType, sourceName, ok, itemsFetched, error}`), `scrub_findings_count int not null default 0`, `duration_ms int`. Index `fetch_cycles_ran_at_idx on (ran_at desc)`. No content-table changes (the FID-022 function-invalidation lesson does not repeat).
- `lib/repositories/cycle-repo.ts` (one owner, Law 13): `recordFetchCycle(result)` — single insert, serialize outcomes; **call-site catches** (observability must never break ingestion — documented trade-off; a missed record shows honestly as "no cycle recorded yet"). `getStatusSnapshot()` — latest cycle + trailing 48 cycles + per-source derived map (latest outcome per source across the window).
- Wire at the END of `runFetchAllSources` (covers both entry points — script and API route — by construction). Cycle duration measured inside the service.
- `app/status/page.tsx` (ISR 60, public, no auth): heartbeat (last ranAt via `relativeTime`, totals, duration), per-source table (name, type, last outcome, items), recent-cycles list (last 24). Honest empty state pre-first-record. Sitemap entry; linked from About's fetch-status section.
- `app/api/status/route.ts`: JSON snapshot (`{lastCycle: {ranAt, succeeded, failed, itemsFetched}, sources: [...]}`) for badge/uptime probes — same `getStatusSnapshot`, no duplication.

### Stream B — freshness stamp

- `getIndexUpdatedAt(): Promise<Date | null>` in content-repo (scalar `max(updated_at)` where archived=false).
- Rendered inside `TypeListingPage` (it already owns its data fetching — no prop drilling through 20+ wrappers): `Index updated {relativeTime} · refreshes hourly` under the tagline, only when a timestamp exists. Stamp refreshes via the hourly purge (FID-2026-0905-001) — label staleness bounded by listing revalidate windows, which is the honest cadence.

### Stream C — Rising tuning

- Migration: `create or replace content_rising` — same signature (no caller breakage), internals retuned: gate `rating > prev_rating` (strict, unchanged), rank by relative momentum `(rating - prev) / greatest(prev, 0.05)` desc, abs delta as tiebreak. Floor 0.05 bounds amplification at 20× (prevents tiny-prev explosions).
- `contentMetricsSchema` gains `prevRating: z.number().min(0).max(1).optional()` — parse stops stripping; deltas displayable. Backward compatible (optional).
- New `content_top_movers(p_days int, p_limit int)` — strict gainers over the window by abs delta, setof content.
- Rising page: two sections — "Climbing now" (retuned rising) and "Biggest moves this week" (movers with displayed delta, computed in TS from `metrics.prevRating`).
- **Scheduled checkpoint (documented, not code):** after 7 days of full coverage (~2026-09-12), re-probe delta distribution; if the 0.05 floor under- or over-filters, adjust the floor, not the formula.

### Stream D — alerting

- `/api/cron/purge` response: `{purged: true, cycle: {ranAt, failed} | null}` — reads the just-recorded cycle (the service records before the route purges).
- Workflow purge step: after HTTP 200, parse the body; if `cycle.failed > 0`, `echo "::warning::fetch cycle reported ${failed} failed source(s)"` — visible in the run summary + email notifications carry it. Purge-step failure semantics unchanged (warning-only).

## AUDIT — verification plan

- **Static:** gates exit 0; build shows `ƒ /api/status`, `○ /status 60`.
- **Call-graph (Law 4):** `recordFetchCycle` called exactly once (fetch-service tail); `getStatusSnapshot` → 2 callers (page + JSON route); `getIndexUpdatedAt` → 1 (TypeListingPage); `content_top_movers` → 1 (rising page); purge body consumed in workflow YAML.
- **Runtime (local :3100):** trigger a real cycle via `/api/cron/fetch` → `fetch_cycles` row lands; `/status` renders heartbeat + per-source table; `/api/status` JSON matches; listings show the stamp; `/rising` renders both sections (or honest empty states).
- **Runtime (production):** post-deploy dispatched workflow run shows fetch + purge + (if failures) warning annotation; `/status` live; badge JSON 200.
- **SQL:** both new/replaced functions probed directly with real parameters before wiring.

## Self-correct during implementation (the perfection loop, on the code)

**The movers collapse.** After the first real cycle, `content_top_movers(7,12)` went **2 → 0**: it ranked by
`rating - prev_rating`, but `prev_rating` is overwritten every cycle while the rating itself decays hourly — so a
week's organic gain is absorbed into the new baseline within one cycle. A "this week" section ranked on per-cycle
deltas can never survive a cycle. Same defect demoted "climbing now" to decay-noise.

**The fix — carried rolling baselines.** Metrics now carry `ratingDayAgo`/`ratingWeekAgo` (+ ISO `At` markers),
refreshed only when older than their window by `refreshMomentumBaselines()` (bounded at 400 patches/cycle, called
in the fetch service, failure-isolated). The SQL functions rank against these baselines; rows without a seeded
baseline are honestly excluded until their first refresh. zod schema extended so parse no longer strips the
fields. Evidence after two cycles: 400 rows seeded, 2 cycles recorded, Rising renders its honest empty state and
will populate as baselines age (first real day-delta ≈ tomorrow's cycle).

Two throwaway intermediate migrations (`20260906010000`, `20260906020000`) supersede each other; the final
function shape is in `20260906020000_momentum_baselines.sql`.

## Closure evidence (2026-09-05)

- **Static:** type-check, lint, build all exit 0; build table shows `ƒ /api/status`, `○ /status 1m`, `○ /rising 10m`.
- **Call-graph (Law 4):** every new symbol has production callers (probed: `recordFetchCycle` → fetch-service;
  `refreshMomentumBaselines` → fetch-service; `getStatusSnapshot` → /status page + /api/status;
  `getLatestCycle` → purge route; `getIndexUpdatedAt` → TypeListingPage; `content_top_movers` → rising page).
- **Runtime (local :3100):** two real cycles triggered via `/api/cron/fetch` → `fetch_cycles` rows landed (2);
  purge body carries `{"purged":true,"cycle":{"ranAt":…,"failed":0}}`; `/api/status` returns the full snapshot;
  `/status` renders the live heartbeat (`5/5`, `9.3s`) after its first ISR window; listings render
  "Index updated 1m ago · refreshes hourly"; `/rising` renders the honest empty state (baselines age into real
  deltas over the next cycles — first day-delta tomorrow).
- **Production:** live on `49290e6`. `/api/status` returns the real snapshot — including the 22:49:17Z cycle
  (5/5 sources, 137 items, 37.1s) recorded by the production hourly cron itself on the new deploy; `/status`
  renders the heartbeat; the freshness stamp renders on listings. The engine now exercises
  record → baseline-refresh → purge → annotate hourly with zero operator action.
