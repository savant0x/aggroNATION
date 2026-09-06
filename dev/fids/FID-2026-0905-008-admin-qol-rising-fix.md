# FID-2026-0905-008

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-008-admin-qol-rising-fix.md` |
| **ID**       | FID-2026-0905-008 |
| **Severity** | major |
| **Status**   | closed — verified |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator: full QOL audit of /admin; /rising is non-functional |

## Summary

Three streams. (A) **The Rising fix** — live probes proved the momentum
mechanism is structurally dead: every hourly upsert REPLACES the whole
metrics jsonb, wiping `ratingDayAgo`/`ratingWeekAgo`; the refresher then
re-seeds them at the fresh rating, so baseline == current for 664/664 rows
(delta bp: min/p50/max all 0) and the `rating > ratingDayAgo` gate can never
pass. Fix: carry baselines through upserts (pure fn + tests), making them the
intended staircase. (B) **Per-source "Fetch now"** — `runFetchForSource`
existed but no route/row-button exposed it; retrying one source meant
refetching all 19. (C) **Failure streak visibility in the admin table**.

## RED — evidence (probed live 2026-09-05)

1. `content_rising(168,40)` → 0 rows; `content_top_movers(7,12)` → 0 rows.
2. Gate analysis: 664 rows carry `ratingDayAgo`; **0** would pass
   `rating > ratingDayAgo`; delta distribution min/p50/max = exactly 0.
3. `buildUpsertRow` writes `metrics: { likes, comments, rating, prevRating }`
   — the four baseline keys are absent ⇒ jsonb replaced ⇒ baselines wiped
   every cycle; `upsertContentBatch`'s read preserves ONLY `prevRating`.
   `refreshMomentumBaselines` then re-seeds at the new rating → staircase
   degenerates to a per-cycle snapshot. This also silently broke the
   FID-0905-002/003 verification assumption ("baselines age over days").
4. Admin: no `POST /api/admin/sources/[id]/fetch`; per-row actions are
   Edit/Restore/Delete only; a single failing source costs a full 19-source
   cycle to retry (~40 s + rate budget).
5. Table shows `lastError (×streak)` only inside the errored row's name cell;
   no at-a-glance streak/health column (streak data: `consecutiveErrors`).

## GREEN — design

**A (Rising):** new pure `carryMomentumBaselines(storedMetrics, incoming)`
in `lib/momentum.ts` — merges the four baseline keys from the stored blob
into the incoming upsert metrics when present (absent keys stay absent; the
refresher owns seeding). `upsertContentBatch`'s pre-read selects the stored
metrics jsonb and applies the carry per row. The existing tests + new cases
pin the semantics (carry preserves, absent seeds via refresher, garbage
stays absent). Rising then works organically: any item whose engagement
grows past its day-ago baseline surfaces within a cycle.

**B (Fetch now):** `POST /api/admin/sources/[id]/fetch` — requireAdmin,
loads source via `getSourceById` (existing repo fn), `runFetchForSource`,
`purgeContentRoutes()`, returns the outcome (ok/items/error/warnings).
Row button "Fetch now" (busy per-row) with an honest outcome toast — the
existing `fetchRun` summary bar pattern, reused per-row.

**C (Streak):** health chip column in `SourceTable` — green dot enabled /
grey archived / amber streak>0 with `×N` / red streak ≥ AUTO_DISABLE side.
No new data: `consecutiveErrors` + `enabled` are already on the row.

## Trade-offs

- Carrying baselines keeps them past their window until the refresher's
  bounded pass reaches the row (≤400/cycle, 8-day read window) — a stale
  baseline can briefly over-weight an item's delta; the strict `>` gate and
  the Sept-12 tuning review own that risk.
- Per-source fetch runs the source's interval/maxItems config exactly like
  the engine — no drift, no new fetcher surface.

## AUDIT — verification plan

- Unit: carry-fn cases (preserve both, preserve-one, absent, wrong-types).
- SQL probe post-fix: simulate a cycle — upsert an item with a HIGHER rating,
  confirm `rating > ratingDayAgo` row appears in `content_rising`.
- Gates exit 0; npm test ≥62 green.
- Runtime: per-source fetch-now 200 + outcome JSON (admin cookie), 401 anon;
  row shows streak chip; /rising renders items when probe seeds a grower.
- Production: deploy + /rising probe; ledger close.

## SELF-CORRECTS (caught by the verification loop)

1. First e2e probe failed honestly: the carry injected baselines into the
   incoming metrics, but `buildUpsertRow` re-parses through `contentSchema`
   and the row's TS metrics TYPE omitted the four baseline keys — so the
   schema/type layer stripped them again before write. Fixed by widening the
   `UpsertContentInput.metrics` type (the zod schema already declared the
   keys — the type was the liar). Second e2e: PASS.
2. Carry semantics refined by the trace probe: the stored row had NO
   baselines (wiped pre-fix), so the honest test is seed-then-carry — cycle 1
   + refresher seeds, cycle 2 carries. Documented in the e2e; the earlier
   "carry preserves" tests already pinned the preserve path.

## CLOSE — evidence (2026-09-05)

- E2E (real upsert path + real RPC): cycle1 rating 0.40 + refresher →
  `ratingDayAgo=0.4`; cycle2 upsert rating 0.45 → baseline SURVIVES (0.4);
  `content_rising(168,40)` returns the grower row. Row restored after.
- Unit: 7 new carry tests — 69/69 total, gates exit 0 (type-check, lint,
  build).
- Per-source fetch: route 401 anon; admin click on Hacker News row → toast
  `"Hacker News: Fetched 20 item(s)."`, fetched count 620→640 in the table
  (screenshot), HEALTH chips render green `ok` across all rows.
- /rising anon render: "Climbing now" + honest empty state (baselines reseed
  organically as the hourly cycles run with the carry live).
- Note: pre-fix data has every baseline == rating, so Rising populates as
  items GROW past their next cycle's reseeded baseline — expect content
  within 1–2 cycles of deploy, full staircase within 24h.
