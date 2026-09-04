# FID-2026-0904-012

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-012-production-hardening-isr-completion.md` |
| **ID**       | FID-2026-0904-012 |
| **Severity** | major |
| **Status**   | converged |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE Amendments 28–29 follow-up; production audit 2026-09-04 (`dev/audits/2026-09-04-full-site-audit.md`) |

## Summary

The production audit found four P1 hardening gaps (no security headers, zero
og/twitter metadata, soft-404s on bad article/watch ids, missing
robots.txt/sitemap.xml) and — discovered while re-grounding on ECHO — a
**Ground-Truth violation in FID-2026-0904-011/Amendment 28**: the "ISR floors +
no-cache hole closed" claim is realized only on the home route. Build output
and live cache headers prove the seven content listings, article, and watch
pages still render dynamically and are served `Cache-Control: private,
no-store` — every view is a full DB round trip, exactly the burn pattern
FID-011 claimed to have closed. This FID remediates all of it and corrects the
SCOPE record.

## Evidence (RED)

All evidence from tool output, 2026-09-04, production `aggro-nation.vercel.app`
and local production builds (`next build && next start`).

**E1 — FID-011 ground truth (build output, local `npm run build`):**

```
Route (app)                  Revalidate  Expire
┌ ○ /                                1m      1y     ← the ONLY ISR page
├ ƒ /article/[itemId]
├ ƒ /github
├ ƒ /huggingface
├ ƒ /opensource
├ ƒ /reddit
├ ƒ /rss
├ ƒ /search
├ ƒ /trendshift
├ ƒ /watch/[videoId]
└ ƒ /youtube
```

**E2 — live cache headers (production, repeated hits):**

```
/ ........................ Age: 235, Cache-Control: public, must-revalidate, X-Vercel-Cache: STALE   ← ISR working
/youtube ................. Age: 0, Cache-Control: private, no-cache, no-store, X-Vercel-Cache: MISS  (hits 1–3)
/article/trendshift_... .. Age: 0, Cache-Control: private, no-cache, no-store, X-Vercel-Cache: MISS  (hits 1–3)
/watch/{realVideoId} ..... Age: 0, Cache-Control: private, no-cache, no-store, X-Vercel-Cache: MISS  (hits 1–2)
/search .................. Age: 0, Cache-Control: private, no-cache, no-store (expected for ?q)
```

**E3 — root cause, article/watch:** both declare `export const revalidate`
(300) and take no `searchParams`, but dynamic-route pages in Next 16 are
dynamic at runtime unless they opt into the runtime-ISR contract.
Controlled experiment (added `generateStaticParams() { return [] }` to
`app/watch/[videoId]/page.tsx`, rebuilt):

```
├ ● /watch/[videoId]      ← flips to ISR/SSG marker; mechanism proven
```

**E4 — root cause, listings:** the same experiment applied to
`app/youtube/page.tsx` did **not** flip it (`├ ƒ /youtube` persisted). The
pages await `searchParams` for `?cursor`/`?dir` pagination — request-time
input on a shared route can never be prerendered or ISR-cached. Query-string
pagination and ISR are structurally incompatible on one route.

**E5 — security headers (production response headers):** only
`Strict-Transport-Security` present (Vercel default). Missing: `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, any CSP.

**E6 — social metadata:** `grep -c 'og:|twitter:'` on served HTML of home and
`/article/trendshift_zvec-ai_zvec-grep` → **0 matches on both**. Links shared
to Discord/X/Slack render bare.

**E7 — soft-404s:** `/article/does-not-exist` → **HTTP 200** ("Article not
found" panel); `/watch/does-not-exist` → **HTTP 200**. Both render from the
in-page `ArticleNotFound`/`WatchNotFound` components instead of `notFound()`.

**E8 — SEO files:** `GET /robots.txt` → 404; `GET /sitemap.xml` → 404.

**E9 — SCOPE record drift:** Amendment 28 states content pages "moved from
force-dynamic to ISR floors (60s home/type pages, 300s article)". E1/E2
disprove the type-pages and article claims. Amendment 29's "YOUTUBE_API_KEY …
rejected by the API" claim was also disproven later the same day (key valid;
probe channel id was wrong) — corrected in the same SCOPE amendment.

## Proposed Solution (GREEN)

Six work items, ordered. Principles: every fix at the lowest correct layer
(Law 13), no query-string state on cached routes (E4's lesson), the purge
helper stays the single cache owner (Law 13 — one route list).

### 1. Security headers — `next.config.mjs` static `headers()`

`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy:
camera=(), microphone=(), geolocation=()`, and a minimal
CSP `frame-ancestors 'none'` (safe to ship with zero breakage; it is the
modern clickjacking defense and does not interact with our YouTube
*outbound* embed — `frame-ancestors` governs who embeds US, not who we
embed). A full-surface CSP (script/style nonce plumbing, ytimg/Supabase
allowlists) is real work with real breakage potential — recorded as a
deferred follow-up rather than smuggled in here half-tested.

### 2. Social metadata — `metadataBase` + per-surface `generateMetadata`

- `config/site.ts` gains `url: "https://aggro-nation.vercel.app"` (single
  source for canonical/og absolute URLs; one place to change when a custom
  domain lands).
- Root layout: `metadataBase`, `openGraph` + `twitter` defaults (banner.jpg
  as site image).
- Article page: full `generateMetadata` — title, description = excerpt,
  og:image priority `github.ogImageUrl → thumbnailUrl → banner.jpg`, og:url,
  `twitter:card: summary_large_image`.
- Watch page: metadata image = YouTube thumbnail (i.ytimg.com), same card
  shape.
- Listing pages: inherit site default + their existing per-page
  title/description (already present on /github; extend the same metadata to
  the other listings).

### 3. Real 404s — `notFound()` + root `not-found.tsx`

- `app/not-found.tsx` (styled, in-layout; the default is unstyled).
- Article page: `notFound()` when the id prefix is invalid or the lookup
  returns null (lookup *failure* — DB error — keeps the honest "Something
  went wrong" panel; a 500-class condition must not masquerade as 404).
- Watch page: same split.
- Metadata for the not-found title via the 404 route's own metadata.

### 4. robots + sitemap — `app/robots.ts`, `app/sitemap.ts`

- robots: allow all, disallow `/admin`, `/api/`; link the sitemap.
- sitemap: static routes + the seven listings + articles/watch urls generated
  from the DB (`id` + `updated_at` for lastmod), computed server-side with a
  1h revalidate — the sitemap must never render per-request.

### 5. ISR on detail routes — `generateStaticParams() { return [] }`

- `app/article/[itemId]/page.tsx` and `app/watch/[videoId]/page.tsx`: add the
  empty-return GSP (E3-proven mechanism). Pages render on first request, then
  cache; `revalidate` 300 floors unchanged; write-path purge already calls
  `revalidatePath` on the listing routes — extended per item 6 to cover
  detail routes so post-fetch renders stay fresh.

### 6. ISR on listing pages — path-based pagination (replaces `?cursor`)

Query strings cannot be ISR-cached (E4). Pagination moves into the path:

- URLs: `/youtube` (page 1) and `/youtube/page/2`, `/youtube/page/3`, … —
  every page is a stable, shareable, crawlable URL with its own ISR entry.
- Route shape per type: keep `app/{type}/page.tsx` (page 1) and add
  `app/{type}/page/[page]/page.tsx` (pages ≥ 2). Both are thin wrappers over
  the existing `TypeListingPage`. Seven types touched: youtube, rss, reddit,
  huggingface, trendshift, opensource, github.
- `TypeListingPage` switches from `searchParams` to a `page` number prop;
  Prev/Next become page-number links; a "Page N of M" indicator replaces the
  cursor total.
- Repo/SQL: `getLatestContentPage` switches from cursor+direction to
  `page` (offset = (page−1)·pageSize). The `content_page` SQL function is
  replaced by an offset-based signature (migration), preserving the
  sourceId-scoped variant from migration 20260904190000. Trade-off documented
  honestly: keyset pagination was chosen in the Firestore era for doc-cursor
  stability; offset pagination has the classic shift-if-items-inserted-mid-
  browse behavior — at 20/page with hourly fetches this is negligible, and it
  buys shareable URLs + ISR. Supabase has no read quota, so the offset-scan
  cost is immaterial at this scale.
- `supabase-verify.ts` pagination assertions updated to the page-based API.
- `lib/cache/revalidate.ts`: add `revalidatePath("/{type}/page/[page]",
  "page")` coverage per listing route and the article/watch dynamic paths so
  every purge still reaches every cached shape.
- `/search` stays dynamic (per-request `?q` is its nature; documented in code).

Alternatives considered for listings: (a) keep `?cursor` and accept dynamic
pages — rejected: leaves FID-011's goal unrealized and every view on the DB;
(b) client-side pagination over an ISR shell — rejected: splits rendering
models, hurts no-JS/crawler story; (c) PPR experimental flag — rejected:
experimental surface on a production site two days old. Path pagination is
the standard, maintainable answer (Five Questions: maintainable in 2 years —
yes).

## Impact Analysis

- **Files touched:** `next.config.mjs`; `config/site.ts`; `app/layout.tsx`;
  `app/not-found.tsx` (new); `app/robots.ts` (new); `app/sitemap.ts` (new);
  `app/article/[itemId]/page.tsx`; `app/watch/[videoId]/page.tsx`;
  `app/type-listing-page.tsx`; 7× `app/{type}/page.tsx`; 7× new
  `app/{type}/page/[page]/page.tsx`; `lib/repositories/content-repo.ts`;
  `lib/cache/revalidate.ts`; `scripts/supabase-verify.ts`; 1 SQL migration.
- **URL change:** `/{type}?cursor=…&dir=…` → `/{type}/page/N`. Zero external
  equity at stake (site live since 2026-09-04); all links internally
  generated.
- **No schema changes** (columns untouched; one SQL function replaced).
- **No new dependencies.**
- **Blast radius:** pagination UX (Prev/Next/total indicator), cache behavior
  (listing + detail routes become ISR), SEO surface (meta/robots/sitemap),
  security headers sitewide. Admin, auth, comments, fetch pipeline untouched.
- **SCOPE corrections:** Amendment 28 restated (ISR actually delivered by
  this FID); Amendment 29's YouTube-key claim corrected (key was valid).

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check`, `npm run lint`, `npm run build` —
  build output must show `●`/ISR revalidate column for `/`, all 7 listing
  routes + `/page/[page]` variants, `/article/[itemId]`, `/watch/[videoId]`;
  zero errors/warnings (Law 15).
- Method 2 (dynamic, local prod build): `next start` →
  - `curl -I` twice each on `/youtube`, `/youtube/page/2`, `/rss`,
    `/article/{realId}`, `/watch/{realVideoId}`: second hits show cached /
    non-`no-store` behavior (home already proves the pattern).
  - `/article/does-not-exist` → **404**; `/watch/does-not-exist` → **404**;
    styled not-found page renders.
  - `/robots.txt` → 200 text; `/sitemap.xml` → 200 xml containing home,
    listings, and article URLs.
  - Article page HTML contains `og:title`, `og:image`, `twitter:card`;
    home contains the default og set.
  - Response headers on `/` contain X-Frame-Options, X-Content-Type-Options,
    Referrer-Policy, Permissions-Policy, CSP frame-ancestors.
  - `scripts/supabase-verify.ts` → 35/35 (pagination tests updated).
- Call-graph reachability (Law 4): `grep -rn "generateStaticParams" app/`
  shows article + watch + 7×page/[page]; `grep -rn "revalidatePath"
  lib/cache/` shows the extended route list; `grep -rn "cursor"
  app/type-listing-page.tsx` → zero matches (old path fully removed);
  `grep -rn "searchParams" app/youtube /app/rss …` → zero on listing pages.
- Production: deploy → repeat the header/404/og/robots checks against
  `https://aggro-nation.vercel.app`.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~35% of doc | Initial draft; audit caught: purge list must cover `/page/[page]` dynamic variants AND detail routes or post-fetch freshness regresses; sitemap needs lastmod from DB, not build time; notFound() must distinguish lookup-failure (500-ish) from missing (404); `?q` search documented-stays-dynamic to prevent future "bug" reports; verify suite signature update added |
| 2 | GREEN → AUDIT | ~6% | Re-audit: confirmed offset-drift tradeoff documented; confirmed no schema change; confirmed CSP minimal subset rationale; no further actionable findings |
| 3 | AUDIT (convergence) | 0% | Zero actionable improvements found — convergence detected, loop terminated |

## Closure

Implementation evidence required before `closed`: commit SHA + build output
showing ISR markers + live-production header/404/og/robots probe output +
35/35 verify run. Ground-truth rule applies — status without code is invalid.

### Implementation evidence (2026-0904, appended at implementation time)

All six items implemented per spec. Evidence:

- **Verify suite**: 35/35 passed (offset pagination assertions live: page-1
  has 10, page-2 disjoint 3, page-3 empty, page-1 starts at newest).
- **Build route table** (local `npm run build`): `○ /github /huggingface
  /opensource /reddit /rss /trendshift /youtube` all at Revalidate 1m (the
  FID-011 goal realized); `●` on all 7 `page/[page]` routes +
  `/article/[itemId]` + `/watch/[videoId]`; `○ /sitemap.xml` at 1h;
  `/search` remains ƒ (documented).
- **Live prod-server probes** (`next start`, fresh process — note: the first
  probe round accidentally hit a stale FID-011-era server on :3100 and
  showed old behavior; killed PID, re-ran clean):
  - Headers on `/`: X-Frame-Options DENY, X-Content-Type-Options nosniff,
    Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy
    camera=(), microphone=(), geolocation=(), CSP frame-ancestors 'none'.
  - `/article/does-not-exist` → 404; `/watch/does-not-exist` → 404;
    `/youtube/page/abc` → 404; `/github/page/1` → 404 (canonical lives at
    `/github`); unknown route → styled in-layout 404.
  - `/robots.txt` → correct body + sitemap link. `/sitemap.xml` → **948
    URLs** (static + listing pages ≥2 + items).
  - Cache headers: `/`, `/github`, `/github/page/2` → `s-maxage=60,
    stale-while-revalidate`; `/article/…zvec-grep`, `/watch/1NrC-vSrje0` →
    `s-maxage=300` — the E2 no-store hole is closed.
  - og tags on a real article: og:title (repo slug), og:image
    (opengraph.githubassets.com card), twitter:card summary_large_image.
  - `/github` H1 renders **"GitHub"** (metaKey bug from grounding fixed).
  - Law-4 greps: zero `searchParams` usage in listing pages (2 comment
    mentions only), zero `cursor` in type-listing-page.tsx.
- **Migration applied + recorded** on hosted Supabase via
  `scripts/apply-migration.ts`; BOTH keyset `content_page` overloads
  confirmed dropped (pg_proc count 0 — the 180000 six-arg original needed a
  second drop; migration file amended to match).
- Perf-loop delta during implementation: the lint gate caught vestigial
  `failed` state after the 404 refactor — resolved by rendering the 500-class
  panel directly from the catch (cleaner than the flag pattern).
