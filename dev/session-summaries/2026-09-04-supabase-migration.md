# Session summary — 2026-09-04: Firestore → Supabase migration + no-cache hole

Closes FID-2026-0904-009 (GitHub enrichment/opensource type — verified on Supabase),
FID-2026-0904-010 (Supabase migration), FID-2026-0904-011 (render cache). SCOPE
Amendments 26–28.

## Why

Firestore's free tier meters every read/write (50K/20K per day) and the app hit
`RESOURCE_EXHAUSTED` before noon on day 1 — not from launch traffic but from
ordinary development (backfills, fetch cycles, live probes) plus a render path
costing ~240 reads per home view with zero caching. Operator decision (Q&A):
migrate to Supabase (no per-operation billing) AND fix the no-cache hole.

## Decisions (operator-confirmed)

- Hosted Supabase project (not local) — created + linked: `xunlxdvlhfxokxjnxgrp`,
  aggroNATION-app, East US (N. Virginia). Keys in `.env.local`:
  `NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_DB_PASSWORD`.
- Admin: `app_metadata.is_admin` JWT claim (Firebase custom-claim parity).
- Sessions: `@supabase/ssr` cookie pair + middleware (silent refresh).
- Google OAuth: deferred to hosted config; email/password only.
- Cache: 60s ISR floor + write-path purge.

## What shipped

- `supabase/migrations/20260904170000_init.sql` + `…180000_additional_read_functions.sql`
  — 4 tables + profiles, RLS, SQL read-path functions (`content_capped`,
  `content_page` keyset pagination, `content_top_views`, `content_top_rated`,
  `source_update_config/_metadata` jsonb merge-patch).
- `lib/supabase/{env,admin,client,ssr}.ts`; repos rewritten boundary-internals
  only (identical signatures); `middleware.ts`; auth routes + pages; `promote-admin`
  + `register-operator-sources` ported; `.env.example` updated.
- FID-011: `lib/cache/revalidate.ts` + `revalidate` exports on 9 content pages +
  purge calls in 5 write routes.
- Standing suites: `scripts/supabase-verify.ts` (35/35) and
  `scripts/live-auth-verify.ts` (10/10, prod build on :3100).

## Verification evidence

- Data layer vs live hosted DB: 35/35 PASS.
- HTTP auth flow vs prod build: 10/10 PASS.
- Real fetches on Supabase: HN 20, HuggingFace 50, OSP 12 (opensource type),
  Trendshift 30 (all GitHub-enriched), Reddit r/AI_Agents 25 (r/singularity 429 —
  Reddit rate limit, retries next cycle).
- FID-009 pages verified: `/github` 40 og-card images; article page shows the full
  repo card (★ 35.4K/⑂ 8.6K, description, language, license, topics, View on
  GitHub/Homepage, "Open original ↗").

## Resolution: populate-normally decision + firebase removal (Amendment 29)

The Firestore history import was DROPPED by operator decision ("just use the new
db and populate it normally") after the midnight-PT reset didn't materialize —
Supabase is the source of truth; the app was only ~36h old. `scripts/cleanup-remove-firebase.sh`
ran immediately: `lib/firebase/*`, 26 Firestore-era scripts, rules/indexes/config,
firebase deps, and env keys all removed; grep gate is ZERO firebase matches.
Populate-normally verified: full fetch cycle 6/6 OK; hourly GitHub Actions cron
intact; `supabase-verify` 35/35 (pagination now source-scoped via optional
`sourceId` on `content_page`).

## Open item (operator credential)

YOUTUBE_API_KEY in .env.local is rejected (400 "API key not valid") — YouTube
channels can't resolve or fetch until a valid YouTube Data API v3 key is supplied
(console.cloud.google.com → APIs → YouTube Data API v3 → Credentials).

## Operational notes

- Supabase CLI: scoop shim `C:\Users\spenc\scoop\shims\supabase.exe`; add to PATH
  (`export PATH="$PATH:/c/Users/spenc/scoop/shims"`). Already authenticated;
  two pre-existing projects (darkframe, dragons-din) untouched.
- Direct SQL to the hosted DB: pooler `aws-0-us-east-1.pooler.supabase.com:5432`,
  user `postgres.xunlxdvlhfxokxjnxgrp`, password in `SUPABASE_DB_PASSWORD`.
- Hosted email confirmation is ON; registration auto-confirms via the service role
  (`email_confirm: true`) — real verification is future hardening.
- Admin bootstrap: register at `/register`, then
  `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/promote-admin.ts <email>`.
- `scripts/live-auth-verify.ts` expects the production build running on :3100
  (`npx next start -p 3100`).

## Addendum — live admin walkthrough (post-closure)

Operator account `spencerhowell84@gmail.com` created, promoted, and the full
admin flow walked live on :3100 against the hosted Supabase project:

- Login → auto-redirect to `/admin` (app_metadata claim gate), sources table
  renders all 6 sources with live counts/timestamps.
- **Fetch all now** ran the real pipeline: 117 items, honest 4/6 report.
- **Bug found + fixed live**: Hacker News failed its whole batch with
  `author: expected string, received number`. Root cause: fast-xml-parser
  numeric-coerces element text by default, and `Number("0xbadcafebee")` parses
  hex — HN username `0xbadcafebee` became the number 134004633582, failing the
  zod author schema and aborting every item in the source's batch. Fix:
  `parseTagValue: false` on the RSS XMLParser (`lib/fetchers/rss.ts`), which
  matches the file's string-typed RawEntry shapes exactly. Verified: 20/20
  items parse, all authors strings, HN refetch `ok: true` (count 100 → 120),
  server rebuilt/restarted, admin row reads green.
- Add-source modal verified: all six types present incl. **Open Source
  Projects** (`opensource`) as its own type; form opens/closes cleanly.
- r/singularity 429 is honest transient state (Reddit rate-limit); clears on
  the next hourly retry.
