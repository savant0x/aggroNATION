# FID-2026-0904-018

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-018-daily-scrub-briefing.md` |
| **ID**       | FID-2026-0904-018 (scrubber) + FID-2026-0904-019 (The Briefing, same package) |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Author**   | Operator: "do all" of the three follow-ups (scheduled scrubber, full-RSS backfill, The Briefing) |

## Summary

Three-part package executed together:

1. **Scheduled scrubber** — the junk-pattern detector (`lib/quality/scrubber.ts`,
   patterns from the FID-017 corpus audit) runs daily inside the fetch cycle
   (`runFetchAllSources`, first cycle after UTC midnight; a failed scrub never
   fails ingestion). Detection-only: findings go to server logs and
   `FetchAllResult.scrubFindings`, visible in cron annotations. Nothing is
   auto-deleted — scrubbing stays a human decision.
2. **Full-RSS backfill (`--all`)** — ran: only 2 rss rows lack bodies, both
   the previously-insufficient JS-only pages (0 chars / 182 chars) — every
   scrapeable body was already warm from the HN backfill. Flag proven; kept
   in `scripts/backfill-hn-bodies.ts` as a standing utility.
3. **The Briefing (FID-2026-0904-019)** — `/digest` (index of days, derived
   from real content dates — no fake calendar), `/digest/YYYY-MM-DD` (top 5
   per category ranked by the stored rating snapshot), `/digest/feed.xml`
   (outbound RSS 2.0, one item per day, 14-day window). No digest table, no
   cron writes: derived on demand from `published_at` + the fetch-time rating
   (same date → same briefing, honestly). Nav gains a "Briefing" entry;
   sitemap gains `/digest` + one path per content-bearing day.

## Evidence (RED)

- Scrubber: the FID-017 audit script was one-shot (`tmp-body-audit.ts`,
  deleted) — pollution landing after any cron cycle would go unnoticed.
- Backfill scope: `SELECT source_name, count(*) FROM content WHERE
  content_html IS NULL AND source_type='rss'` → `[Hacker News: 2]` pre-run.
- Briefing: no digest surface existed; the site had no outbound feed
  (`grep -r "feed.xml" app/` → none).

## Proposed Solution (GREEN)

- `lib/quality/scrubber.ts` — pattern detector (5 patterns + empty-body),
  `htmlToPlainText`, `detectJunk`.
- `lib/quality/scrub-service.ts` — `runDailyScrub()` scanning `updated_at ≥
  now-24h` (bounded 2000 rows; the corpus was audited clean, new pollution
  arrives via the fetch cycle which stamps `updated_at`).
- `lib/services/fetch-service.ts` — daily slot guard (`getUTCHours() === 0`),
  `scrubFindings` on `FetchAllResult`, failure-isolated try/catch.
- `content-repo.ts` — `getTopItemsForDate` (per-type, day-bounded,
  rating-ordered) and `getRecentContentDays` (derived day index).
- `app/digest/[date]/page.tsx` — `generateStaticParams(){return[]}` runtime-ISR
  (FID-012 E3 contract), revalidate 3600, honest empty-day panel, notFound on
  malformed slugs. Purity-rule compliance: no wall-clock read during render —
  future dates simply query empty.
- `app/digest/page.tsx`, `app/digest/feed.xml/route.ts` — index + outbound
  feed (`dynamic = "force-static"`, s-maxage=3600).
- `config/site.ts` nav + `app/sitemap.ts` entries.

## Impact Analysis

New files: `lib/quality/scrubber.ts`, `lib/quality/scrub-service.ts`,
`app/digest/*` (3), FID. Modified: `content-repo.ts`, `fetch-service.ts`,
`config/site.ts`, `sitemap.ts`. No schema change (derived queries only), no
new deps. ISR: `/digest` + feed at 1h; `/digest/[date]` per-path `●`.

## Verification Plan (AUDIT)

- Method 1: type-check, lint, build (digest routes with correct markers).
- Method 2 (local prod): `/digest` 200 with real days; `/digest/<today>` 200
  rendering ranked top-20 with scores; `/digest/2099-01-01` 200 + honest
  empty panel; `/digest/not-a-date` 404; `feed.xml` valid XML with per-day
  items; `--all` backfill run output.
- Call-graph: grep `runDailyScrub` in fetch-service; `getTopItemsForDate` in
  digest pages; `/digest` in sitemap + nav config.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~30% | Audit caught: scrub must scan only recent rows (bounded reads); scrub failure must never fail the cycle; digest needs the runtime-ISR GSP opt-in like article/watch; purity rule rejected Date.now() in render — future dates handled by the empty-query path instead; sitemap digest URLs must derive from real days, not a calendar loop |
| 2 | GREEN → AUDIT | ~10% | Feed needs `dynamic = "force-static"` + its own s-maxage; nav entry added so the feature is discoverable |
| 3 | AUDIT (convergence) | 0% | Convergence — loop terminated |

## Closure

Evidence required: gates green, local probes (digest URLs matrix, feed XML,
backfill output), commit SHA, production probes post-deploy.

**Verification record (2026-09-05):**

- Gates: `tsc --noEmit` exit 0, `eslint --fix` exit 0, `next build` compiled
  with markers `○ /digest (1h)`, `● /digest/[date]`, `○ /digest/feed.xml (1h)`.
- Call-graph (Law 4): `runDailyScrub` → `lib/services/fetch-service.ts:769`;
  `getTopItemsForDate` → digest page + feed route; `getRecentContentDays` →
  digest index + feed route + `app/sitemap.ts:98`; `/digest` nav →
  `config/site.ts:16`; sitemap static entry → `app/sitemap.ts:61` + derived
  `digestEntries` at :99; `detectJunk` → `lib/quality/scrub-service.ts:36`.
- Local prod probes (:3100): `/digest` 200; `/digest/2026-09-05` 200;
  `/digest/2099-01-01` 200 with the honest empty-day panel;
  `/digest/not-a-date` 404; `feed.xml` 200, `application/rss+xml; charset=utf-8`,
  parse-validated XML, 14 daily items (2026-09-05 → 2026-08-23).
- `--all` backfill previously ran (see FID-017 follow-up record, commit `c039399`):
  only 2 rss rows lack bodies, both JS-only pages.
- Post-deploy production probes recorded in the follow-up evidence commit.
