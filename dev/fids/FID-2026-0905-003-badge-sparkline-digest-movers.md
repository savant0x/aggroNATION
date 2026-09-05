# FID-2026-0905-003

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-003-badge-sparkline-digest-movers.md` |
| **ID**       | FID-2026-0905-003 |
| **Severity** | minor |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator approved all four follow-ups: README status badge, Sept-12 Rising re-review checkpoint, /status sparkline, movers in The Briefing |

## Summary

Four small streams that surface the engine's data outward:

- **A. Badge route + README badge** — a shields.io *endpoint badge* JSON route (`/api/status/badge.json`) reading the same cycle log as /status; README embeds it. The README itself is Firebase-era stale (stack, commands, "X planned") — refreshing it is the same file, same task surface, folded in as stream B.
- **B. README refresh** — stack section (Next 16 + Supabase Postgres + Vercel + GH Actions hourly cron), current env vars, current architecture notes. One-time doc correction; no runtime surface.
- **C. /status sparkline** — inline SVG polyline of items-per-cycle over the trailing ~48 cycles (the snapshot already reads exactly 48). No dependencies, no client JS.
- **D. Movers in The Briefing** — the digest page's newest day gains a "Momentum" section (`content_top_movers(1, 8)`); the feed gains a movers line in that day's item description. Gating is **data-driven** (slug === newest content day), never wall-clock — the purity rule holds, and historical briefings honestly omit momentum (carried baselines are current-state, not retroactively computable).

## RED — evidence (probed 2026-09-05)

1. `getStatusSnapshot()` reads 48 cycles newest-first (`cycle-repo.ts`) — the exact window the sparkline needs; no new query required (Law 13).
2. Digest page (`app/digest/[date]/page.tsx`) derives sections from `SOURCE_TYPES` × `getTopItemsForDate`; the index page derives day slugs from `getRecentContentDays` — a reusable single-day probe for the movers gate.
3. Feed route builds per-day descriptions as indented `lines` before escaping — a movers line slots into the same builder; `escapeXml` already owns escaping.
4. README probed 0–EOF: says "Firebase — Auth + Firestore", "X planned", references `promote-admin.ts` and Firestore rules/indexes — all superseded by the Supabase migration (FID-2026-0904-008/010). The badge belongs in a README that doesn't lie.
5. shields.io endpoint badge contract: JSON `{schemaVersion:1, label, message, color}` served with permissive CORS from a stable URL — a tiny `force-dynamic` route next to `/api/status`.
6. Rising re-review checkpoint (operator-requested): **not code** — recorded as a dated operational task in SCOPE + the FID (probe delta distribution ~2026-09-12; adjust the 0.05 relative-momentum floor if under/over-filtering).

## GREEN — design

- **A.** `app/api/status/badge.json/route.ts` (force-dynamic): reads `getStatusSnapshot()`; message `"{succeeded}/{total} · {items} items"` (age omitted — shields caches would show a lie), color `green` (failed=0) / `orange` (failed>0) / `red` (no cycle). CORS `access-control-allow-origin: *`. README badge line at top.
- **B.** README: Stack / Getting started (env var names per `.env.example`) / Scripts (unchanged) / Architecture notes rewritten to the Supabase + pipelines reality; Firebase-era instructions removed.
- **C.** `/status`: sparkline section above "Recent cycles" — points from `snapshot.recent.slice().reverse()` (oldest→newest), y-scaled to max(itemsFetched), inline SVG (viewBox 600×48, polyline, accent stroke, min/max labels). Zero items → 0-height honest flatline; <2 points → section omitted.
- **D.** Digest `[date]` page: when `date === (await getRecentContentDays({lookbackDays: 1}))[0]`, render a "Momentum" section between header and category sections — `content_top_movers({days:1, limit:8})` rows with displayed `+X.X%` delta from `ratingWeekAgo` (the same baseline the SQL ranked by — no drift). Feed: same gate; movers appended as a `MOMENTUM:` block in the newest day's description.

## Trade-offs

- Endpoint badge hits `/api/status`-grade queries per shields refresh (~5 min cache) — negligible reads, consistent with the status page's own ISR cost.
- Historical digests never show movers: honest limitation (baselines are carried state). Documented on the section itself only if it renders.

## AUDIT — verification plan

- **Static:** gates exit 0; build shows `ƒ /api/status/badge.json`; `/status` still `○ 1m`.
- **Call-graph (Law 4):** `getTopMovers` gains digest caller (now 2 pages); badge route calls `getStatusSnapshot`; README badge URL points at the deployed route.
- **Runtime (local :3100):** badge JSON shape + color states (mock-free: real cycle data); sparkline markup present with real point count; today's digest slug renders the Momentum section, yesterday's does not; feed's newest item carries the MOMENTUM block; older items don't.
- **Runtime (production):** badge URL 200 + shields-compatible JSON; README renders the badge (link check); digest/feed probes repeated post-deploy.
- **Purity:** grep confirms no `Date.now()`/`new Date()` wall-clock in the digest page render path (the
  feed's `lastBuildDate` is pre-existing and outside the render contract).

## Closure evidence (2026-09-05)

- **Static:** gates exit 0; build table shows `ƒ /api/status/badge.json`; `/status` still `○ 1m`.
- **Runtime (local :3100):** badge JSON exactly shields-shaped —
  `{schemaVersion:1,label:"engine",message:"5/5 sources · 137 items",color:"green"}`; sparkline markup renders
  (`Ingestion trend` + polyline) from the snapshot's real points; momentum gate verified data-driven — today's and
  yesterday's briefings both honestly render **no Momentum section** because `content_top_movers(1,8)` returns 0:
  all `ratingWeekAgo` baselines were seeded at the current rating hours ago, so no weekly delta exists yet. The
  week-baseline staircase matures ~2026-09-12 (the scheduled re-review); day-momentum on /rising populates first
  (tomorrow evening). The gate renders nothing rather than faking momentum — by design.
- **Feed:** MOMENTUM block slots into the newest day's description via the same data gate (0 blocks today, for the
  same honest reason).
- **Commits:** implementation + closure recorded in this FID's git history (`49290e6` lineage onward).
