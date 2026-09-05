# CHANGELOG

All notable changes to aggroNATION are recorded here. FID-driven changes
cite the originating FID; routine ops (cron, infra, deps) are listed
without one. Dates are UTC.

## 2026-09-05

### Archived FIDs (ECHO auto-archive contract)

Closed FIDs moved from `dev/fids/` to `dev/fids/archive/` per the ECHO
auto-archive contract. Status was already `closed`; the move satisfies
the "Closed FIDs must not remain in the active `dev/fids/` directory"
requirement.

- **FID-2026-0904-009 — github-enrichment-opensource-type** (`major`):
  GitHub enrichment (stars/forks/topics) and the new `opensource` source
  type. Implementation: `lib/fetchers/github-repos.ts`,
  `lib/services/fetch-service.ts` enrichment path, `content-repo` upsert
  with bucketed `github` jsonb write.
- **FID-2026-0904-010 — supabase-migration** (`critical`): full cutover
  from Firestore to Supabase Postgres. Implementation:
  `lib/supabase/{client,admin,ssr,env}.ts`, `lib/repositories/*.ts` (rewritten),
  `supabase/migrations/*.sql`, `next.config.mjs` updates, the delete script
  + `apply-migration.ts` script. The 0903-series FIDs (001–022) that
  predate this migration reference Firebase code paths that no longer
  exist; they are still in `dev/fids/` pending a separate
  supersession-cleanup pass.
- **FID-2026-0904-011 — render-cache-no-cache-hole** (`major`): fixes
  the no-cache hole in the page-level render cache (the ISR page
  rendered for every request because of a missing `Cache-Control` chain).
  Implementation: `next.config.mjs` `Cache-Control` headers + per-page
  `dynamic`/`revalidate` reconciliation; `scripts/header-probe.ts`
  and `scripts/curl-cache-probe.ts` added for ongoing regression checks.
- **FID-2026-0904-016 — hero-live-signal** (`minor`): live-signal overlay
  on the hero banner (item count, last fetch-cycle recency, live pipeline
  count). Implementation: `components/navbar.tsx` (or hero header
  component), `lib/format/relative-time.ts` extracted util; production
  verified with commit `ce0b304`.

## Future entries

New closed FIDs append a single bullet under `## YYYY-MM-DD` in the
format above. Routine ops (cron tweaks, dependency bumps, config-only
changes) also append here without an FID reference.