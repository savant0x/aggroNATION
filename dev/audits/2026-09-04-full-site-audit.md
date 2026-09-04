# Full Site Audit — aggroNATION on production

**Date:** 2026-09-04 · **Target:** https://aggro-nation.vercel.app · **Method:** live crawl of every route (anon + admin + non-admin sessions), API authz probes, build-output analysis, code review of auth/RLS/middleware.

---

## What's healthy (verified working)

- **All 12 public routes return 200 with real data**: home, /youtube, /rss, /reddit, /huggingface, /github, /trendshift, /opensource, /search, /about, /login, /register. 19 sources active (13 YouTube channels + HN, HF, OSP, 2 subreddits, Trendshift), ~700 content items, zero source errors after the surrogate-pair fix.
- **API authz matrix is airtight**: cron without secret → 401; admin API unauthenticated → 401, non-admin session → 403; comments POST unauthenticated → 401, signed-in → 201. Comment moderation verified (archived on delete).
- **Live auth flow end-to-end**: password grant → session exchange → /api/auth/me returns `isAdmin: true`; non-admin sees a polite "Admin access required" screen on /admin (not a crash).
- **RLS enabled** on all 4 tables; browser never touches the DB directly (all reads via service role server-side); middleware refreshes sessions silently on every matched route.
- **Comment spam shield verified**: throwaway probe account registered and confirmed fine; register route maps GoTrue errors correctly (409 dup / 422 weak / 429 rate-limit).

---

## Issues found (prioritized)

### P1 — should fix this week

1. **No security headers.** Only HSTS is present. Missing: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`. Clickjacking/MIME-sniffing protection is absent. Fix: static `headers()` block in `next.config.mjs`.
2. **No og/twitter meta tags anywhere** (0 on home and articles). Link sharing into Discord/X/Slack renders bare URLs — for a content-aggregator whose growth loop is shares, this is a real acquisition loss. Fix: `generateMetadata` on article pages + a site-level default in the root layout.
3. **Soft-404s**: `/article/does-not-exist` and `/watch/does-not-exist` return **HTTP 200** with a "not found" panel. Bad for SEO (Google flags soft-404s) and for any future monitoring. Fix: `notFound()` from `next/navigation` after the null content lookup, plus a real `not-found.tsx`.
4. **robots.txt and sitemap.xml are 404**. Crawlers have no guidance; nothing tells Google the site exists or what to index. Fix: `app/robots.ts` + `app/sitemap.ts` (listing pages + static routes).

### P2 — next

5. **Every content page renders dynamically (ƒ) except home (○ ISR)** — visible in build output: /youtube, /rss, /reddit, /huggingface, /github, /trendshift, /opensource, /article/[itemId], /watch/[videoId] are all per-request DB reads. The searchParams prop on listing pages opts them out of ISR even though pagination uses `?cursor`/`?dir` (not `?page`). Fix: pass `searchParams` down without destructuring at the page level, or use `connection()`/dynamic APIs deliberately; alternatively accept `revalidate` inside the listing component. Biggest perf win available.
6. **Search page has no result-count indicator and the header shows no pagination** — minor UX gap for a discovery feature; the API supports it.
7. **Home page HTML is 385KB** — all sections embed full item lists. Fine at current scale; watch it as sources grow.
8. **/watch page for non-YouTube ids renders an empty watch shell** (tested `trendshift_*` id): no redirect to /article, no message. Fix: redirect to the article page when the id isn't a video.

### P3 — polish

9. **Middleware runs on every request** including /article, /api/* — fine, but the matcher could exclude more static paths (`/apple-touch-icon`, manifest) later.
10. **`<img>` instead of `next/image`** in ContentCard — no lazy-size optimization, but intentional-looking for remote thumbnails; fine to keep.
11. **/opensource page exists but nav has merged GitHub** — page is reachable, just not linked from nav. Decide: keep as secondary browse view or fold into /github.
12. **CRON_SECRET exists in Vercel env but the site URL isn't in the cron workflow** — once traffic exists, switching the hourly workflow to the webhook (with ISR purge) beats direct-DB writes; cache purges matter when pages are ISR.

---

## Systems notes

- **Firestore→Supabase boundary swap held up**: zero Firebase remnants, all gates green, no drift between repo signatures and SQL functions.
- **Surrogate-pair fix (a2f6492)** is doing its job — 13/13 channels fetched clean since deploy.
- **Cron reliability**: GitHub Actions hourly runs green (5-6/6 sources OK, r/singularity 429s occasionally — Reddit's honest rate limit; recovers next cycle).
- **Env hygiene**: the broken Secret-type NEXT_PUBLIC_ vars were the only Vercel issue class; all three Supabase vars verified decrypting in production runtime.

---

*Method note: every probe against production was read-only or used throwaway accounts; the audit probe account and comment were deleted; no production data was modified beyond that.