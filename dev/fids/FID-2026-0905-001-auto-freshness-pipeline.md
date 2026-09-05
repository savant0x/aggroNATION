# FID-2026-0905-001

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-001-auto-freshness-pipeline.md` |
| **ID**       | FID-2026-0905-001 |
| **Severity** | major |
| **Status**   | converged |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator request: the site must update automatically after each hourly ingest — no manual refreshes, no revalidate-window lag |

## Summary

The ingestion engine (GitHub Actions → `scripts/fetch-all.ts` → direct Supabase writes, hourly) **never fires the
Next.js write-path cache purge**. `purgeContentRoutes()` lives in `next/cache` — a server-runtime-only module that a
standalone Node runner cannot import. The workflow's own comment admits this. Consequence: every hourly cycle writes
fresh rows to the DB, but production keeps serving each ISR page until its revalidate window expires — the exact
"website lags behind and needs manual refreshes" behavior the operator reported.

Second defect found during the same probe: **FID-2026-0904-023's new ISR routes are missing from the purge lists
entirely** — `/rising`, `/tags/[tag]`, `/repo/[slug]`, `/digest`, `/digest/[date]` are never purged even by in-process
write paths (admin fetch-now, source CRUD). They self-heal only at their revalidate windows.

## RED — evidence (all probed 2026-09-05)

1. `.github/workflows/cron-fetch.yml` tail comment: *"cannot purge the ISR cache via revalidatePath — something a
   standalone runner cannot do"*. The engine ships data but never invalidates the CDN cache.
2. `grep -rn purgeContentRoutes` → exactly 7 call sites, all inside the Next server (admin routes + `/api/cron/fetch`).
   `scripts/fetch-all.ts` contains **zero** purge calls (verified: no `next/cache` import possible outside the runtime).
3. `lib/cache/revalidate.ts`: `CONTENT_ROUTES` (17 entries) and `CONTENT_PAGE_ROUTES` (9 entries) contain none of the
   five FID-023 routes. `/saved` is correctly absent (`force-dynamic`, never cached).
4. Rising momentum probe: `metrics.prev_rating` is absent on all production rows because commit `4584c29` (the
   momentum code) was pushed 21:42:52Z while the last cycle (20:45:51Z) ran on `678cd3e`. Not a code bug — the next
   cycle seeds the first snapshot. Dispatch issued: run 33994798061.
5. `public/sw.js` probed: caches only `/_next/static` (immutable, hash-keyed) and serves navigations network-first —
   the PWA is **not** a staleness source. Exonerated.
6. Vercel project env has `CRON_SECRET` (production). Parity with the local value is unverified — will be probed
   post-deploy (401 vs 200 on the new route decides; no blind env reset).

## GREEN — design

**Architecture: keep the proven engine, complete it with a purge webhook.**

1. **`lib/auth/cron.ts`** (new, Law 13 single owner): `isCronAuthorized(request)` — the timing-safe Bearer compare
   over pre-hashed SHA-256 buffers currently inlined in `/api/cron/fetch`. Both cron routes consume it.
2. **`/api/cron/purge`** (new GET route): auth via the shared helper, then `purgeContentRoutes()` — pure cache
   invalidation, no fetching, idempotent, cheap. Returns `{ purged: true }`. `dynamic = "force-dynamic"`.
3. **`lib/cache/revalidate.ts`**: add `/rising`, `/digest`, `/digest/[date]` to the static list; add
   `/tags/[tag]`, `/repo/[slug]` to the page-pattern list (following the existing `revalidatePath(route, "page")`
   convention exactly, Law 11). This closes the FID-023 wiring gap.
4. **Workflow**: after the fetch step (`if: always()` — purge is idempotent and a partial cycle still wrote data),
   `curl -sS -f "$SITE_URL/api/cron/purge"` with `Authorization: Bearer $CRON_SECRET`. Failure logs a `::warning::`
   annotation but does NOT fail the job: the DB is already fresh, and a missed purge degrades to today's behavior
   (revalidate-window freshness), never to wrong data. Stale comments about the "unhosted" site are corrected.
5. **Ops**: set GH repo secrets `SITE_URL` (https://aggro-nation.vercel.app) and `CRON_SECRET` (same value as the
   Vercel production env). Vercel parity decided by the post-deploy probe, not assumption.

**Rejected alternatives (documented, Five-Questions screened):**
- *Vercel Cron*: Hobby plan is daily-granularity; hourly requires Pro. GH Actions is free, proven, and already
  configured — no vendor migration justified.
- *SW content caching*: violates the freshness/honesty contract settled in FID-023 stream M (the SW probe confirms
  it was deliberately built content-free).
- *Supabase → Vercel on-demand triggers (pg_notify/webhooks)*: requires new infra (edge function + secret
  distribution) for what a one-line curl from the existing runner achieves. The GH runner is the middleman — zero
  new moving parts.

## Trade-offs

- A purge fires even when a cycle fetched 0 new items: `revalidatePath` only marks routes stale — the next visitor
  pays one render, idle traffic costs nothing. Correctness over micro-optimization.
- Two secrets must stay in sync across Vercel and GH (both are the same value; the probe makes drift loud, not silent).

## AUDIT — verification plan

- **Static:** type-check + lint + build exit 0; build output shows `ƒ /api/cron/purge`.
- **Call-graph (Law 4):** `isCronAuthorized` has exactly 2 production callers; `purgeContentRoutes` gains 1
  (the purge route); the five FID-023 routes greppable in `revalidate.ts`; the workflow step greppable in the YAML.
- **Runtime (local, :3100):** `/api/cron/purge` → 401 (no auth), 401 (wrong secret), 200 + `{"purged":true}`
  (correct secret). `/api/cron/fetch` behavior unchanged.
- **Runtime (production):** purge route 200 with the deployed secret (proves parity); GH run log shows the purge
  step and its HTTP 200; DB `metrics.prev_rating` present after the dispatched cycle; `/rising` renders real items
  (or the honest empty state if no delta yet) — momentum verified across a real cycle boundary.

## Implementation pair

Implemented in the same session; SHAs recorded in the closure section after production verification.
