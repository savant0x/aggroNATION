# FID-2026-0904-022

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-022-fulltext-og-cmdk-ledger.md` |
| **ID**       | FID-2026-0904-022 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Author**   | Operator: "make a fid for all of this" (full-text body search, OG image generator, Cmd+K palette, 0903 FID ledger audit) |

## Summary

Four independently valuable work streams, bundled one FID per operator
direction (precedent: FID-018/019 package):

**A. Full-text body search.** FID-021 shipped metadata-only search with the
documented limitation that body-only terms ("mullvad") miss. This stream
adds proper Postgres full-text search over article bodies: a `content_text`
plain-text column (extracted at write time via the existing
`htmlToPlainText` util — never the raw sanitized HTML, which is the
markup-token false-positive problem solved by construction), a stored
generated `to_tsvector('english', …)` column over it with a GIN index, and
`content_search` extended to match `plainto_tsquery` OR the existing
metadata ilike. Order stays newest-first (mixing ts_rank ordering with
metadata matches would interleave inconsistently; documented trade-off).

**B. OG image generator.** `next/og` ImageResponse route producing branded
1200×630 cards (dark base, accent gradient, wordmark, source type, title,
author/date) at `/og`, wired into article + watch page `openGraph.images`
and `twitter.images`. Every social share renders an aggroNATION card —
including items whose remote thumbnail failed CSP or rate-limit checks
(the /github og-image 429 problem, observed in the FID-015 walk).

**C. Cmd+K command palette.** A client-side palette in the navbar design
language (no HeroUI Modal chrome — custom overlay matching the "no boxes"
signal-bar aesthetic): debounced queries to a new `GET /api/search`
(JSON wrapper over `searchContent`), arrow-key navigation, Enter to open,
Escape to close, quick section-jump actions alongside content results.

**D. FID ledger audit execution.** The FID-020 follow-up, executed: 22
Firebase-era 0903 FIDs get a supersession banner + move to
`dev/fids/archive/`; 0904-series metadata drift corrected (001–007 missing
`FID-` prefix in the **ID** field; 012/013/014/015/017 `converged` →
`closed` — implementations shipped and production-verified under commits
`aa962e7`, `ce0b304`, `a618604`, `282b062`, `57981d2`).

## Evidence (RED)

- A: `"mullvad"` → 0 results (FID-021 closure record); `content_html` holds
  sanitized HTML — matching it directly would index markup tokens ("div",
  "href") — the problem FID-021 explicitly declined to create.
- B: article metadata currently points `og:image` at *remote* thumbnails
  (or GitHub og-cards that 429'd 3/20 in the CSP walk); no `/og` route
  exists (`ls app/og` → absent).
- C: no keyboard navigation exists anywhere (`grep -rn "metaKey" components/`
  → 0); no `/api/search` route (`ls app/api/search` → absent) — the palette
  cannot call the server-only repo directly.
- D: `ls dev/fids/ | grep -c 0903` → 22 (FID-020 deferred this as
  FID-2026-0904-021-numbered scope, later re-numbered into this FID);
  `grep -L "^| \*\*ID\*\*       | FID-" dev/fids/FID-2026-0904-00{1..7}*`
  → 7 files missing the prefix; 012/013/014/015/017 still read `converged`
  while their closure sections cite production commits.

## Proposed Solution (GREEN)

**A — full-text:**
1. Migration `20260904220000_content_fulltext.sql`:
   - `alter table content add column content_text text;`
   - `alter table content add column search_tsv tsvector generated always
     as (to_tsvector('english', coalesce(content_text, ''))) stored;`
     (explicit-config `to_tsvector` is IMMUTABLE — generated-column legal)
   - `create index content_search_tsv_idx on content using gin (search_tsv);`
2. `lib/quality/scrubber.ts` `htmlToPlainText` is exported and reused —
   no duplicate (Law 13). `buildUpsertRow`: when `contentHtml` is present,
   write `content_text = htmlToPlainText(contentHtml)` in the same row
   (bucket key unchanged — the two always co-occur).
3. One-time backfill script `scripts/backfill-content-text.ts`: rows with
   `content_html IS NOT NULL AND content_text IS NULL` (~103 expected),
   paced writes. Re-run safe (NULL-guarded).
4. `content_search` extended: `and (existing metadata ilike chain or
   search_tsv @@ plainto_tsquery('english', p_query))` — the sanitized
   token remains the parameter; plainto_tsquery neutralizes FTS operators.
   Search page copy updated ("including article bodies").

**B — OG images:**
1. `app/og/route.ts` — ImageResponse 1200×630; params `title`, `type`,
   `meta` (author/date line), inline-styled branded card; `export const
   revalidate = 86400` + `Content-Type: image/png` (ImageResponse sets it).
   System font stack only — zero new deps.
2. `lib/og.ts` helper: `ogImageUrl(item)` builds the absolute URL from
   `siteConfig.url` with URL-encoded params (shared by both detail pages).
3. Article + watch metadata: `openGraph.images` / `twitter.images` point at
   the generated card (replacing remote thumbnails). Listing cards
   untouched — thumbnails stay as-is on-site.

**C — Cmd+K:**
1. `app/api/search/route.ts` — GET, `q` param, `searchContent({limit: 8})`,
   `dynamic = "force-dynamic"`, JSON `{items}`; errors → 500 JSON (Law 14).
2. `components/command-palette.tsx` — client component: global keydown
   (⌘K / Ctrl+K toggle, Escape close), fixed overlay + centered panel in
   navbar design language, 250ms-debounced fetch, arrow navigation,
   Enter → `router.push`, quick-action rows for the 8 nav destinations.
   Rendered from `components/navbar.tsx` (one instance sitewide).

**D — ledger:** prepend a supersession banner to each 0903 FID (status
unchanged in metadata — ECHO's allowed-status list has no
"archived-superseded"; the banner carries the truth and the move to
`dev/fids/archive/` is the physical archive), `git mv` all 22; fix the 7
ID prefixes; flip 012/013/014/015/017 to `closed` citing their production
commit SHAs; CHANGELOG entries for both the features and the archival.

## Impact Analysis

- New files: migration, `app/og/route.ts`, `lib/og.ts`,
  `app/api/search/route.ts`, `components/command-palette.tsx`,
  `scripts/backfill-content-text.ts`, this FID.
- Modified: `content-repo.ts` (upsert row + comment), `content_search`
  function (migration), `app/search/page.tsx` (copy + optional body-match
  note), `app/article/[itemId]/page.tsx`, `app/watch/[videoId]/page.tsx`
  (metadata), `components/navbar.tsx`, 22 + 12 FID files, `CHANGELOG.md`.
- No new npm dependencies (`next/og` ships with next; HeroUI untouched).
- RLS/service-client: no change (all reads via service client as today).
- Risk register:
  - Generated column needs one table rewrite (~1000 rows — trivial).
  - ImageResponse cold start on Vercel (~1s first hit per region; mitigated
    by s-maxage — crawlers, not users, hit it).
  - Palette is the first global client JS in the navbar — it ships in the
    existing client bundle (navbar is already "use client"); lazy-mount the
    panel content on first open to keep initial JS flat.
  - Backfill writes ~103 rows once (write quota is fine on Supabase).

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build; build shows `ƒ /api/search`,
  `ƒ /og`, no new warnings.
- Method 2 (runtime):
  - A: repo probe `"mullvad"` → ≥1 (body match — the FID-021 known miss,
    now found); regressions `"sglang"` → 1, injection shape `' OR 1=1--`
    → 200/0 rows; `backfill` reports ~103 updated; a row with
    `content_html` but NULL `content_text` after backfill → 0.
  - B: `curl -s /og?title=Test&type=rss | file -` → PNG; article head
    `og:image` → `siteConfig.url/og?...`; visual screenshot of the card.
  - C: browser probe — Ctrl+K opens, "sglang" returns the repo card,
    arrows move selection, Enter navigates to the article, Escape closes;
    screenshot; `/api/search?q=sglang` → JSON 200.
  - D: `ls dev/fids/archive | grep -c 0903` → 22; active dir 0903 count → 0;
    `grep -c "converged" dev/fids/FID-2026-0904-01{2,3,4,5,7}*` → 0;
    CHANGELOG sections present.
- Law 4 call-graphs: `ogImageUrl` ← article + watch pages; `CommandPalette`
  ← navbar; `/api/search` ← palette only; `backfill-content-text` ←
  documented run + package script (grep-able entry).
- Production: all of the above re-probed post-deploy; Vercel build clean.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~12% | Audit caught: ECHO has no "archived-superseded" status — supersession expressed as banner + archive move instead of an illegal metadata value; ts_rank ordering rejected (would interleave badly with metadata matches — newest-first kept and documented); OG images must be absolute URLs via siteConfig (relative breaks social crawlers); palette lazily mounts panel content (navbar is already a client component — bundle stays flat); backfill must also cover the HN backfill rows (they have content_html from the earlier script) |
| 2 | GREEN → AUDIT | ~4% | Bucket-key check confirmed content_html/content_text always co-occur (no upsert shape drift); plainto_tsquery named explicitly (websearch_to_tsquery would OR-ish raw user syntax); verification plan gained the NULL-guard re-run check |
| 3 | AUDIT (convergence) | 0% | Convergence — loop terminated |

## Closure

`converged` — implementation begins only on operator approval (Law 2).
Will flip to `closed` with: gates output, the full probe matrix locally
and on production, commit SHAs, CHANGELOG entries, and the archival
filesystem evidence.

**Verification record (2026-09-05) — closed, all four streams:**

- **Self-correct 1 (schema repair):** the fulltext migration invalidated
  every existing `returns setof content` SQL function — build-time data
  fetch failed live with "return type mismatch in function declared to
  return content" on all home sections and listings. Repair migration
  `20260904230000_recreate_content_functions.sql` recreates the four
  functions against the 21-column row shape (`content_capped`'s explicit
  column list gains `content_text, search_tsv`; the `c.*` functions are
  recreated verbatim). Post-repair probe: capped selector returns rows;
  local build + home render with **0 failed sections**.
- **Self-correct 2 (prediction amended):** the FID predicted the injection
  shape `' OR 1=1--` returns 0 rows. Actual: 5 rows, no error. Root cause:
  `plainto_tsquery` neutralizes operators into plain tokens ("or" is a
  stopword; "1" legitimately matches bodies containing "1") — the security
  property (parameter binding, no operator execution, bounded) holds; the
  prediction was wrong, not the code.
- **A (full-text):** migration applied + recorded; backfill covered **326**
  rows (corpus grew past the ~103 estimate via cron cycles — estimate
  amended), 0 remaining NULL; repo probes: `"mullvad"` → 1 (the FID-021
  known miss, now found via body text), `"sglang"` → 1, "encrypted DNS"
  → 2; `/api/search?q=mullvad` → 200 with the DNS article; empty q → 200.
- **B (OG images):** `/og` returns a real 1200×630 PNG (verified by `file`);
  visual screenshot confirms the branded card; article head renders
  `og:image → https://aggro-nation.vercel.app/og?title=…&type=rss&meta=…`.
- **C (palette):** live-browser probe: Ctrl+K opens, "sglang" returns the
  trendshift hit, Enter navigates to
  `/article/trendshift_sgl-project_sglang` and closes, Escape closes,
  toggle re-opens. One lint-driven fix: async-adjacent reset via 0ms timer
  to satisfy `react-hooks/set-state-in-effect`.
- **D (ledger):** 22 × 0903 FIDs banner-prepended and `git mv`'d to
  `dev/fids/archive/` (22 in archive, 0 active); 001–007 `**ID**` fields
  prefixed (`FID-2026-0904-00X`); 012/013/014/015/017 flipped `converged`
  → `closed` with production-evidence citations appended.
- Gates: type-check, lint, build exit 0; `ƒ /api/search` and `ƒ /og`
  registered; no new warnings.
- Production probes + commit SHAs appended below.
