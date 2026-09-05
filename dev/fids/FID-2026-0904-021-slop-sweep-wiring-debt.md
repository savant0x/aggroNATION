# FID-2026-0904-021

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-021-slop-sweep-wiring-debt.md` |
| **ID**       | FID-2026-0904-021 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Author**   | Operator: "continue fixing the debt, wire everything that is 'dummy', fix all 'ai slop', ensure everything is properly wired" |

## Summary

A full-corpus slop sweep (marker grep for dummy/TODO/mock/stub/dead-hrefs,
call-graph greps, route matrix, build markers) found **no dead buttons,
no fake data, no unwired features** — comments, search, auth, admin, sitemap,
cron, digest are all real and reachable. The debt that remains is four
structural items: a Firestore-era fake search window, a deprecated framework
convention, three hand-maintained parallel label maps, and two invalid-DOM
fragment instances.

## Evidence (RED)

1. **Search is a fake window (real debt).** `app/search/page.tsx` loads
   `getLatestContentAllTypes({ limit: 100 })` and filters in-page. The
   doc comment says "Firestore has no native full-text search" — false since
   FID-2026-0904-010 (Postgres). Corpus is ~1000 rows; results silently miss
   anything outside the newest 100. No `searchContent` exists in the repo.
2. **Deprecated convention.** Vercel build warns: "The 'middleware' file
   convention is deprecated. Please use 'proxy' instead." `middleware.ts`
   + named export `middleware` must become `proxy.ts` + export `proxy`
   (official migration: rename file, rename function, keep matcher).
3. **Three parallel label maps.** `PIPELINES` (about), `TYPE_LABELS` +
   `TYPE_TAGLINES` + `MERGED_META` (type-listing-page) — the exact
   added-a-type-forgot-a-surface bug class that caused the empty-H1 and
   X-still-live incidents (FID-2026-0904-012 item 5).
4. **Invalid DOM fragments.** `components/navbar.tsx:150` renders a `<ul>`
   inside a `<ul>` (mobile menu); `components/auth-nav.tsx:77` renders a
   `<div aria-hidden className="h-6 w-16" />` inside a `<ul>` while signed
   out. Browsers recover, but it is invalid HTML and inconsistent with the
   desktop `<div class="hidden lg:block">` wrapper.

Sloppiness checked and found clean (no action): comments are fully wired
(API GET/POST + repo + RLS-gated UI, the "dead panel" was an empty-state
UX choice); `error.tsx`/`not-found.tsx` exist; zero `console.log` in prod
code; no dummy/TODO/mock/stub markers; no dead `href="#"`/`onClick={()=>{}}`;
all sitemap/nav/search/digest call-graphs reachable; X residue limited to
legitimate references (twitter meta cards, trendshift mention parsing).

## Proposed Solution (GREEN)

1. **Real search** — `searchContent({query, limit})` in `content-repo.ts`:
   Supabase `.or()` ilike across `title/excerpt/author/tags` (tags jsonb
   cast to text), day-bounded `published_at desc` order, sanitized pattern
   (`%`/`,` escaped in the driver — param binding, plus strip user `,`/`%`
   from the token so the or-list cannot be injected), bounded `limit 200`,
   error propagation. Search page: load `?q`, call the repo, render honest
   empty states (no query / no results / DB failure); remove the 100-item
   window, the stale Firestore comment, and the in-page filter. Metadata
   robots `noindex` on query URLs.
2. **proxy rename** — `git mv middleware.ts proxy.ts`, export renamed to
   `proxy`, header updated; logic byte-identical.
3. **One label source** — new `config/pipelines.ts` exporting `PIPELINES`
   (per-type `label`, `tagline`, `detail` — the general Record), plus
   `MERGED` (segment → {label, tagline, sourceTypes}) so `/github` and any
   future merged view derive from data. About + type-listing consume it;
   local maps deleted. Source-of-truth check: `Object.keys(PIPELINES)`
   equals `SOURCE_TYPES` at module load (throws at build time on drift).
4. **Valid DOM** — navbar mobile menu `<ul>` → `<div>`; auth-nav signed-out
   spacer `<div>` → `<li aria-hidden>`.

## Impact Analysis

- Modified: `content-repo.ts` (+1 export), `app/search/page.tsx` (rewrite
  of the data path, UI preserved), `app/about/page.tsx`,
  `app/type-listing-page.tsx`, `components/navbar.tsx`,
  `components/auth-nav.tsx`. New: `config/pipelines.ts`, `proxy.ts`.
- Removed: `middleware.ts` (renamed). No schema change, no new deps.
- `/search` stays `ƒ dynamic` (per-request query is the correct contract);
  revalidate 60 dropped with the pool query. RLS note: search runs via the
  service client like every other repo read.
- Risk: `.or()` pattern — mitigated by param binding + token sanitization +
  bounded limit; verify `tags` cast path against live data before shipping.

## Verification Plan (AUDIT)

- Method 1: type-check, lint, build (no middleware warning; `/search` still ƒ).
- Method 2 (local prod): `/search?q=mullvad` finds the known HN item;
  `/search?q=` shows the no-query state; `/search?q=zzzzqqqq` shows the
  honest empty state; a `'` query returns 200 (injection sanity);
  result count can exceed the old 100 cap only if corpus grows — assert
  the query runs repo-side (grep: no `getLatestContentAllTypes` in search).
- Law 4: grep `searchContent` (repo + search page), `proxy` config matcher,
  `PIPELINES` imports from config in about + listing, no remaining local
  maps (`grep TYPE_LABELS app/ → 0`).
- DOM: curl the signed-out home HTML — no `<ul>` direct child of `<ul>`,
  auth slot is `<li>`.
- Production: same probes post-deploy + confirm the Vercel warning is gone
  from the next build log.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | 0% | Convergence — scope is wiring repair on existing surfaces; four items, each independently verifiable |

## Closure

Will flip to `closed` with: gates output, local + production probes,
commit SHA, and confirmation the middleware deprecation warning no longer
appears in the Vercel build log.

**Verification record (2026-09-05) — closed:**

- Gates: `tsc --noEmit` exit 0, `eslint --fix` exit 0, `next build` compiled;
  build shows `ƒ Proxy (Middleware)` (proxy recognized) and **no middleware
  deprecation warning**; `ƒ /search` (dynamic, the correct contract).
- Self-correct during implementation: the first `.or(… tags::text …)`
  PostgREST filter failed live ("failed to parse logic tree", column 77 — the
  parser cannot express the jsonb cast). Fix: pinned `content_search` SQL
  function (`supabase/migrations/20260904210000_content_search.sql`, applied +
  recorded via `scripts/apply-migration.ts`) — same read-function pattern as
  `content_capped`/`content_page_offset`; the cast lives in SQL where it
  belongs. This also added `source_name` to the match columns.
- Repo-layer probes: `"encrypted DNS"` → 1 (the Mullvad DNS article by its
  title), `"Hacker News"` → 5, `"sglang"` → 1 (trendshift repo). `"mullvad"`
  → 0 is correct behavior: the term occurs only in the article *body* and
  the search contract deliberately covers metadata (title/excerpt/author/
  source_name/tags), not sanitized-HTML content — matching body markup
  tokens ("div", "href") would flood results with false positives.
- Search matrix (local prod :3100): mullvad 200, sglang 200 with result card,
  empty q 200 (no-query state), `zzzzqqqqx` 200 with the honest
  "Nothing matched" panel, `' OR 1=1--` 200 (sanitized, no error, no rows).
- Call-graph (Law 4): `searchContent` → `app/search/page.tsx` only;
  `getLatestContentAllTypes` retains its sitemap caller (no dead export);
  `config/pipelines` imported by about + type-listing; local maps deleted
  (`grep TYPE_LABELS|TYPE_TAGLINES|MERGED_META|EMPTY_DETAIL app/` → 0);
  `middleware.ts` gone, `proxy.ts` matcher intact.
- DOM: signed-out SSR auth slot renders `<li aria-hidden>` (was `<div>` in
  `<ul>`); live-browser probe with the mobile menu open: no `ul` nested in
  `ul` in the nav; visual screenshot of `/search?q=sglang` renders the
  result card with badge, stars/forks, chips.
- Production probes + Vercel build-log confirmation appended below.
