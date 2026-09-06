# FID-2026-0905-007

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-007-listing-pagination.md` |
| **ID**       | FID-2026-0905-007 |
| **Severity** | major |
| **Status**   | closed — verified |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator: /github shows no pagination (only /github/new does) and only ~20 cards; every listing must paginate and reach all items |

## Summary

Pagination becomes a property of EVERY listing view, not just the strict
archive. Highlights pages (the default `/{type}` view) gain real page-able
diversified selectors backed by new SQL; strict archive pagination moves to
its own coherent URL space (`/new/page/N`); the seven `/page/[page]` routes
become highlights deep-pages. Total-page math comes from real counts, never
guesses.

## RED — evidence (probed live 2026-09-05)

1. `TypeListingPage` renders pagination nav ONLY when `sort !== "highlights"`
   (isHighlights renders `<span />` placeholders). Default view = zero nav.
2. `/page/[page]` routes (all 7) pass no `sort` → strict — the URLs highlights
   would naturally link to actually render a different view.
3. `getLatestContentPage` returns `{ items }` only — no total — so strict
   totalPages is derived from a DIFFERENT query (`countContent`) that counts
   disabled-source rows too.
4. Pool math flaw: with only 2 sources in the repo categories (one Trendshift
   feed, one OSP feed), the per-source cap of 3 pools **6 of 174 items** —
   page-able highlights with the flat cap would be 1 page. The cap exists to
   stop many-source floods (14 YouTube channels), not to strangle
   few-source categories.
5. Existing live pool check: `content_capped` (used by home, unchanged) is
   cap-3 by design for the 20-card home grid.

## GREEN — design

**SQL (new, page-able):**
- `content_capped_pages(p_types, p_cap, p_limit, p_page)` — same ranked
  per-source pool as `content_capped` (enabled sources only, columns
  enumerated like the existing fn because `search_tsv` is generated) plus
  whole-page OFFSET. `p_cap NULL` → **auto-cap**: `max(3, ceil(240 /
  active_source_count))` — every source gets a fair share of a ~2-page window
  while floods stay capped; few-source categories pool their full depth
  (2 sources → cap 120 → pool 136 → 7 pages).
- `content_capped_pages_count(p_types, p_cap)` — pool size for exact
  totalPages.

**Repo:** `getDiversifiedContentPage({ sourceType|sourceTypes, pageSize,
page, perSourceCap? })` → `{ items, total }` (RPC pair); strict keeps
`getLatestContentPage` + `countContent`.

**URL contract (all 7 categories):**
- Highlights: `/` (page 1) + `/page/N` (N≥2) — the seven existing
  `/page/[page]` routes switch to `sort="highlights"`.
- Strict: `/new` (page 1) + NEW `/new/page/N` (N≥2) routes ×7.
- Nav renders in BOTH modes: Newer / "Page N of M" / Older, hrefs built by
  mode. Highlights caption: "Balanced across sources — deeper pages go
  deeper into each feed."

**Cache:** revalidate list gains the seven `/new/page/[page]` patterns.

## Trade-offs

- Auto-cap 240/active is a policy number (≈ 2 pages of fair share), recorded
  here and in the SQL — tune it at the Sept-12 review alongside Rising.
- Strict deep pages keep counting via countContent (includes disabled-source
  rows); a trailing empty strict page is possible after a source is disabled
  — accepted, self-heals next cycle purge.

## AUDIT — verification plan

- Migration applies; live probes: per-page rows, page-1∩2 disjoint, count
  matches pool, auto-cap pool >> 6 on /github types.
- Gates exit 0; npm test 62+ green.
- Runtime: /github renders 20 cards + "Page N of M" + Older; /github/page/2
  renders DIFFERENT items (disjoint from page 1); /github/new/page/2 renders
  strict; a single-type page (/rss) shows nav too.
- Production: deploy + probe /github?page=1 vs /page/2 disjointness.

## SELF-CORRECT (caught by the verification loop)

The first implementation linked highlights "Older" to the existing
`/page/N` routes while page 1 still rendered through the round-robin
selector (`getLatestContentMerged`/`Diversified`). The disjointness probe
measured **7 of 20 repos appearing on both page 1 and page 2** — two
different selection algorithms cannot share a URL space. Fix: page 1 of
every highlights listing now comes from the same `content_capped_pages`
pool as deep pages (home keeps round-robin — a hero, not a listing). Also
fixed during SQL iteration: `SETOF content` + `c.*` breaks on the generated
`search_tsv` column (return-type mismatch), and the enabled-sources filter
from `content_capped` had to be carried over.

## CLOSE — evidence (2026-09-05)

- Migration pair applied + recorded (`20260905030000`, `20260905040000`).
- Live SQL probes: auto-cap pool on /github types = **136** (was 6 under the
  flat cap-3), pages 1–7 walk distinct items, p1∩p2 = 0, YouTube pool = 252
  (flood cap holds across 14 channels).
- Gates: type-check 0, lint clean, tests 62/0, build green with both route
  families registered (`● /github/page/[page]`, `● /github/new/page/[page]`).
- Runtime: /github renders "Page 1 of 7" + Older; /github/page/2 renders 20
  DIFFERENT repos (overlap 0), nav "← Newer / Page 2 of 7 / Older →" with
  correct hrefs (DOM-verified); /github/new/page/2 strict deep "Page 2 of 9";
  /rss shows "of 4". Screenshot confirms page-2 cards render in the new
  RepoCard design.
- Cache: revalidate list extended with the seven `/new/page/[page]` patterns.
