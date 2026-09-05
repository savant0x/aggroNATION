# FID-2026-0904-010

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-010-supabase-migration.md` |
| **ID**       | 2026-0904-010 |
| **Severity** | critical |
| **Status**   | closed |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments (per ECHO attribution rules, no agent names) |

## Summary

Firestore's free tier bills **every operation** (50K reads / 20K writes per day, hard stop) and the app hit `RESOURCE_EXHAUSTED` before noon on day 1 of dev — not from launch traffic but from ordinary development (backfills, fetch cycles, live probes) plus a render path that already costs ~240 reads per home view. A multi-source news aggregator is structurally read-heavy; per-operation metering is a permanent ceiling, not a day-one fluke. Operator decision (recorded in SCOPE): migrate the data + auth layer to **Supabase** (no per-operation billing on the free tier) and fix the no-cache hole (FID-2026-0904-011). This FID owns the migration; FID-011 owns the render-cache work. The converged-but-unverified FID-2026-0904-009 (GitHub enrichment + `opensource` type) **rides this port** — its code is written, its Firestore verification was quota-blocked, and verification now happens against Supabase.

## Evidence (RED)

- Quota exhaustion today, pre-launch: even a bare read query returned `RESOURCE_EXHAUSTED: Quota exceeded` (2026-09-04 probes); Firestore free tier = 50K reads / 20K writes daily.
- Read cost measured in code: home renders 5 sections; each section calls `getEnabledSources()` (reads ALL 39 source docs) before its per-source content queries (`lib/repositories/content-repo.ts` `getLatestContentDiversified`/`getLatestContentMerged` + `app/page.tsx`) — ≈195 source-doc reads + ~40 content reads ≈ **240 reads per view**, with zero caching (see FID-011 RED).
- Writes are likewise metered: the 1,256-doc `sourceName` backfill, idempotent full-cycle upserts (every fetched doc re-written whether changed or not), and repeated verification cycles drew down 20K writes before noon.
- Port surface enumerated (grep): firebase is imported by `lib/auth/session.ts`, 3 auth/API routes, `app/api/health/route.ts`, login/register pages, the 3 repositories, `lib/services/fetch-service.ts` (repo imports only), and 26 scripts.
- Tooling: supabase CLI installed (scoop shim `C:\Users\spenc\scoop\shims\supabase.exe`), Docker 28.4.0 present, **no** `~/.supabase/access-token`, no `supabase/` dir, no supabase keys in `.env.local` → hosted-project link is not possible without operator credentials; **local stack is available today**.
- Auth surface is small: client auth exists only in login/register pages (`firebase/auth` import — verified); all server gating flows through `getCurrentUser()` (`lib/auth/session.ts`, cookie → `verifySessionCookie`, `admin` custom claim).

## Proposed Solution (GREEN)

**Boundary-swap architecture.** The three repositories are already the ONLY modules touching the DB (module docstrings assert this; route/service/pages import only repo functions). Rewrite the *internals* of the 3 repos against Supabase, preserving every exported function name/signature and domain shape (`Source`, `ContentItem`, `Comment` via the existing Zod schemas — the zod layer survives unchanged, which also keeps FID-009's schema work intact). Pages, fetch-service, article/watch readers, admin dashboard, and API routes compile and behave identically. The fetchers are pure network code — untouched.

### 1. Schema (SQL, versioned in `supabase/migrations/`)

Snake_case columns (Postgres-native; mapper in each repo converts to the camelCase zod shapes — one mapper per repo, Law 13):

- `sources(id text pk, type text not null, name text not null, url text not null, enabled bool not null default true, archived bool not null default false, config jsonb not null default '{}', metadata jsonb not null default '{}', resolution_cache jsonb, created_at timestamptz not null, updated_at timestamptz not null)` — `id` stays an app-generated UUID string (Firestore doc ids were `doc().id`; keeping string ids makes the data migration lossless and comment/content FK references stable).
- `content(id text pk, source_id text not null references sources(id), source_type text not null, external_id text not null, title text not null, excerpt text not null default '', content_html text, url text not null, thumbnail_url text, source_name text, github jsonb, author text not null default '', published_at timestamptz not null, tags jsonb not null default '[]', metrics jsonb not null default '{}', featured bool not null default false, archived bool not null default false, created_at timestamptz, updated_at timestamptz not null)`. Deterministic content ids (`{type}_{externalId}` via existing `buildContentDocId`) remain the PK — preserves `/article/{id}` URLs, comment `contentId` links, and idempotent upsert semantics (`ON CONFLICT (id) DO UPDATE`).
- `comments(id text pk default gen_random_uuid()::text, content_id text not null, user_id text not null, user_email text not null, body text not null, archived bool not null default false, created_at timestamptz not null)`.
- `profiles(id uuid pk references auth.users(id) on delete cascade, email text, is_admin bool not null default false, last_sign_in_at timestamptz)` — mirrors the admin flag for SQL queries/audit; the *runtime* gate reads the JWT claim (below).
- Indexes: `content(source_type, archived, published_at desc)`, `content(archived, published_at desc)`, `content(source_id, archived, published_at desc)`, `content(source_id, archived, (metrics->>'views')::int desc)`, `comments(content_id, archived, created_at desc)`.
- **Read-path SQL functions** (the Firestore composite-index dance becomes one statement each, and this is where FID-011's read consolidation lands): `content_page(type[], page_size, cursor_published_at, cursor_id, direction)` with keyset pagination (`ORDER BY published_at DESC, id DESC` — id breaks timestamp ties, fixing Firestore's unstable same-second paging), `content_diversified(source_type, limit, cap)` using `row_number() OVER (PARTITION BY source_id ORDER BY published_at DESC)` ≤ cap then round-robin top-up, `content_merged(types[], limit, cap)`, `content_top_by_views(source_id, limit)`, `content_count(type[] | null)`. Repos call these via `.rpc()` and map rows → zod.
- **RLS** as defense-in-depth mirroring `firestore.rules` (server uses the service-role key, which bypasses RLS — the Admin-SDK-parity model): `content` world-read; `sources` no anon access; `comments` world-read + authenticated create where `user_id = auth.uid()`; `profiles` owner read/update. Browser never reads the DB directly today (verified: no client-side DB imports), so RLS read policy is belt-and-suspenders.

### 2. Auth (parity with the current model)

- New `lib/supabase/env.ts` (literal-key client vars, mirroring FID-012's inlining rule), `lib/supabase/admin.ts` (service-role client, `server-only`, mirrors `lib/firebase/admin.ts`), `lib/supabase/client.ts` (browser, anon key — auth only).
- **Session**: adopt `@supabase/ssr` `createServerClient` (canonical Next pattern) — middleware refreshes the access token on navigation, so the current 7-day persistence semantics survive (Firebase session cookies were 7d; Supabase access JWTs are ~1h but the refresh token in the httpOnly cookie pair keeps sessions alive silently). `getCurrentUser()` keeps its exact signature (`SessionUser { uid, email, isAdmin }`) and keeps working for server components and routes; only internals change (verify user via server client, read `is_admin` from `app_metadata`).
- **Admin gating**: `app_metadata.is_admin` set at promote time via the service-role `updateUserById` (1:1 with today's Firebase custom claim — zero extra lookup per gate; profiles row mirrors it). Same known behavior as today: the claim lands in the JWT on the next token refresh, so the operator re-signs-in once after promotion (unchanged from Amendment 10).
- Login/register pages swap `firebase/auth` → `supabase-js` (`signInWithPassword`, `signUp`, Google OAuth deferred to hosted — see operator decisions). Session/logout/me routes swap admin calls: session route verifies the access token + mints the SSR cookie pair; logout revokes (Supabase refresh-token revocation via service role) + clears cookies, preserving the FID-014 hardening (a logged-out session must actually die).
- `promote-admin` script ports to service-role `updateUserById`.

### 3. Sequencing (dependency order — the quota wall dictates it)

1. `supabase init` + `supabase start` (local Docker stack) → schema migrations applied locally.
2. Repo rewrites + SQL functions + env + auth swap; delete nothing firebase yet (app must keep compiling while Firestore still holds prod data).
3. Static gates; port the standing verification suites (`data-layer-verify`, `auth-crud-verify`, `auth-registration-verify`, `watch-comments-verify`, `fetch-service-verify`, and the FID-016/017/018/022 suites) to run against the local Supabase stack.
4. **FID-009 closure rides here**: run the OSP→`opensource` migration script + trendshift/OSP GitHub-enrichment fetch cycles against Supabase; verify github data, og-cards, merged GitHub home section, `/github` page — then close FID-009 with code evidence.
5. Data migration `scripts/migrate-firestore-to-supabase.ts` (Firestore admin read → Supabase service-role write, batched, idempotent, dry-run mode) — **runs when the Firestore quota resets** (midnight PT) or on operator command; ~40 sources, ~1,400 content docs, comments.
6. Remove `lib/firebase/*`, `firestore.rules`, `firestore.indexes.json`, firebase deps + env vars; zero firebase imports remain (grep gate).
7. Record in SCOPE; deploy plan: hosted Supabase project (link + `db push` + env swap) whenever the operator creates one.

Alternatives rejected: stay on Firestore with Blaze (still per-op metered — doesn't fix the ceiling); convert to SQLite/embedded (no multiuser auth, no hosting story); direct `pg` driver instead of supabase-js (works, but supabase-js gives auth integration + hosted parity + `.rpc()` for the SQL functions — Five Questions #4/#5).

## Impact Analysis

- New: `lib/supabase/{env,admin,client}.ts`, `supabase/config.toml` + `supabase/migrations/*.sql` (schema, RLS, functions), `scripts/migrate-firestore-to-supabase.ts`, ported `promote-admin`, standing Supabase verify suites, `middleware.ts` (SSR session refresh).
- Modified (internals only): 3 repositories, `lib/auth/session.ts`, `app/api/auth/{session,logout,me}/route.ts`, `app/(auth)/{login,register}/page.tsx`, `app/api/health/route.ts` (drops its firebase ping), `package.json` (+`@supabase/supabase-js`, +`@supabase/ssr`; firebase deps removed in step 6).
- Deleted (step 6): `lib/firebase/*`, `firestore.rules`, `firestore.indexes.json`, firebase env vars.
- Schema/data: 4 tables + profiles; ids preserved (content deterministic ids, source uuid strings) → zero URL/comment/FK breakage.
- Env additions: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Blast radius: the swap is confined to the repo + auth boundaries; the ~15 app pages and fetch-service compile unchanged (signature parity is the contract). Scripts: ~10 standing/operational scripts port, ~15 temp probes deleted.
- Honest Supabase free-tier tradeoffs (recorded, not hidden): 500MB DB / 5GB egress / project pauses after 1 week inactivity — no per-op billing, which is the property the operator chose. Local dev has none of these limits.

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check`, `npm run lint`, `npm run build` — clean; grep gate: **zero** `lib/firebase|firebase-admin|firebase/app|firebase/auth` imports after step 6.
- Method 2 (dynamic, local Supabase stack): ported data-layer suite (source create → fetch → upsert idempotency → diversified/merged/paginated/count/top-by-views shapes → hard delete) 1:1 against today's 13/13-style assertions; ported auth suite (register → session cookie pair → `getCurrentUser` → admin promote → 403 gate for non-admin → logout revocation); served-page probes: home + `/github` + `/article` render from Supabase; comment create/list/archive round-trip.
- FID-009 closure evidence (rides here): OSP source/doc migration + enrichment fetch cycle on Supabase → `github.stars > 0`, og thumbnails, merged GitHub section served, no `rss_*` OSP docs.
- Data migration: dry-run parity count (Firestore docs vs Supabase rows per collection) before live run.
- Reachability: grep `createServerClient|serviceRole|\.rpc\(` → definition + consumers; grep each repo function → its pre-existing production callers (unchanged set).

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Operator architecture call (Supabase + "do both") adopted. Audit pass 1 found and folded in: `health` route imports firebase (add to surface); 26 scripts need per-script disposition (standing suites port, temp probes delete — not "port everything"); `cookies()` is async in Next 16 (session internals must await — signature parity already holds); comments/content id preservation is a hard requirement for URL + FK stability; Blaze does not fix the ceiling (alternative rejected with reason). |
| 2 | AUDIT → SELF-CORRECT | <2% | Five Questions pass: works for all cases (multi-source read-heavy is the core case); survives a hostile attacker (RLS + service-role split, no client DB writes); maintainable in 2 years (boundary-swap + versioned SQL migrations + canonical SSR auth); industry standard (supabase-js + PostgREST + SQL functions). Convergence check: changes now limited to operator decisions below. |
| 3 | RED → AUDIT (double-audit) | <2% | Design claims verified against code: fetch-service imports only repo functions (port impact zero — its earlier firebase grep hit is a comment string, not an import); login/register use auth SDK only (no `db` import → browser DB access is zero, RLS is pure defense-in-depth); no `middleware.ts` exists (SSR session middleware is genuinely new surface, accounted); `cookies()` already awaited in `lib/auth/session.ts` (Next 16 async-cookie contract already satisfied). No actionable improvements — loop converged. |

## Closure

IMPLEMENTED + VERIFIED (2026-09-04; operator approved via decision Q&A — hosted project, app_metadata admin claim, @supabase/ssr, email/password only). Evidence:
- Hosted project created + linked: ref `xunlxdvlhfxokxjnxgrp` (aggroNATION-app, N. Virginia). Env keys in `.env.local`.
- Migrations pushed: `supabase/migrations/20260904170000_init.sql` (schema + RLS + content_capped/content_page/content_top_views) and `20260904180000_additional_read_functions.sql` (content_top_rated + jsonb merge-patch fns).
- Repos rewritten against Supabase with identical signatures: `lib/repositories/{source,content,comment}-repo.ts`; fetch-service's only direct DB leak (`persistResolutionCache`) moved into source-repo (`saveResolutionCache`); `upsertContentBatch` shape-buckets so absent github/contentHtml/createdAt never clobbers stored values; jsonb merge-patch via SQL fns (PostgREST replace bug caught in audit).
- Auth swapped: `lib/auth/session.ts` (SSR cookie pair), `middleware.ts` (silent refresh), API routes session/logout/register(+new)/me, login+register pages, `lib/supabase/{env,admin,client,ssr}.ts`. Google deferred per operator. Email confirmation handled server-side at register (email_confirm: true — documented tradeoff).
- Zero firebase imports in `app/` + `lib/` (grep gate). lib/firebase/* retained ONLY for the pending data migration script, then deleted.
- Dynamic verification vs live hosted DB: `scripts/supabase-verify.ts` **35/35 PASS** (sources/content/pagination/diversified/merged/rankings/comments/jsonb merges/auth claims); `scripts/live-auth-verify.ts` **10/10 PASS** over HTTP (register → sign-in → session cookie → non-admin gate 403 → promote → admin → logout revocation → cron fetch). Pages served from prod build on :3100 with real fetched data.
- **Data migration SUPERSEDED**: operator decision ("use the new db and populate it normally") dropped the Firestore history import — the app was ~36h old and the new DB is the source of truth. Firebase removal then completed immediately: `lib/firebase/*`, 26 Firestore-era scripts, rules/indexes/config, `firebase` + `firebase-admin` deps, and the env block all deleted (see SCOPE Amendment 29); grep gate zero. Populate-normally verified (full fetch cycle 6/6 OK + hourly cron intact). `content_page` gained an optional sourceId scope so the pagination suite stays deterministic alongside real data.
- See SCOPE Amendment 27; FID-011 (cache) and FID-009 (GitHub enrichment, verified on Supabase: 30/30 trendshift + 12/12 opensource docs enriched with real stars/og-cards) closed alongside.
