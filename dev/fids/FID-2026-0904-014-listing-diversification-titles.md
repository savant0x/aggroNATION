# FID-2026-0904-014

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-014-listing-diversification-titles.md` |
| **ID**       | FID-2026-0904-014 |
| **Severity** | major |
| **Status**   | converged |
| **Created**  | 2026-09-04 |
| **Author**   | Exploration audit 2026-09-04 (visual/logic pass on production build) |

## Summary

Two listing-surface defects, one product and one SEO: (1) type listing pages
render raw newest-first order, so a single high-volume source floods the
grid — live probe of `/youtube`: **16 of the first 20 cards from one channel**
("Julian Goldie SEO", near-identical thumbnails, identical excerpts). The
home page solved this in FID-2026-0904-006 with per-source-capped round-robin
selection (`getLatestContentDiversified` / `getLatestContentMerged`); listings
never adopted it. (2) Five of eight listing pages export no page metadata, so
they render `<title>aggroNATION</title>` — `/youtube /rss /reddit
/huggingface /github` (probe output below), while `/trendshift` and
`/opensource` do it correctly. This FID makes diversified selection the
default listing view with a path-based strict-chronological alternative, and
adds the five missing title/description exports.

## Evidence (RED)

**E1 — source flood** (live curl of `/youtube`, card source names, first 20
cards): `16× Julian Goldie SEO, 2× Fahd Mirza, 1× Nate Herk, 1× Codedigipt`.
Cause: `TypeListingPage` calls `getLatestContentPage` (raw
`content_page_offset`, newest-first, no per-source cap). Home calls
`getLatestContentDiversified` (cap 3/source) — same DB, different selector.

**E2 — missing titles** (live `<title>` probe, 2026-09-04):

```
/youtube     -> <title>aggroNATION</title>
/rss         -> <title>aggroNATION</title>
/reddit      -> <title>aggroNATION</title>
/huggingface -> <title>aggroNATION</title>
/github      -> <title>aggroNATION</title>
/trendshift  -> <title>Trendshift - aggroNATION</title>
/opensource  -> <title>Open Source Projects - aggroNATION</title>
```

Root cause: `type-listing-page.tsx` exports `metadata = { title: "Browse" }`
but the five page wrappers never override it (the two with metadata exports
win). The shared component's own export never reaches the URL since the
route files own metadata resolution.

**E3 — ISR constraint**: a `?sort=` query-param toggle would flip every
listing page back to dynamic rendering (FID-012 E4: searchParams access
forces dynamic on Next 16.2.6) — undoing the cache completion. Any sort
surface must be a path segment.

## Proposed Solution (GREEN)

### 1. Two listing views, both path-based (ISR-safe)

- **`/{type}` — "Highlights" (new default).** Diversified round-robin with
  per-source cap 3 via the existing selectors (single-type:
  `getLatestContentDiversified`; merged GitHub: `getLatestContentMerged`).
  This is the anti-flood front door: a fresh feed cannot own the grid.
- **`/{type}/new` — "Strict order" (new route, page 1 of the archive).** Raw
  newest-first via the existing `getLatestContentPage({ page: 1 })`. The
  honest chronological view, one click away.
- **`/{type}/page/N` (N≥2) — unchanged semantics**: strict chronological
  archive pages (already exist, already in the sitemap; no URL changes, old
  links keep working). Page 2's "Newer" link points at `/{type}/new`;
  highlights page 1's "Older" link points at `/{type}/page/2` with the
  caption "showing highlights — older pages are strict chronological".
- Sort toggle link in the listing header: `Strict order →` on highlights,
  `← Highlights` on chronological. No JS, pure links, both cached.
- Rationale for the seam: diversified selection is window-based (per-source
  caps over recent items) and cannot meaningfully enumerate deep pages;
  chaining highlights-page-1 → archive-pages is exactly the HN front
  page / newest mental model. Zero repo/SQL changes — both selectors exist.

### 2. Five missing metadata exports

Per-type `metadata` (title + description, matching the /trendshift pattern)
on `/youtube /rss /reddit /huggingface /github` page files. The shared
component's `title: "Browse"` export stays as fallback for any future route.

### 3. Purge + sitemap coverage

- `lib/cache/revalidate.ts`: add the seven `/{type}/new` routes to the
  static purge list (they are cached shapes whose data fetch cycles change).
- Sitemap: no additions (`/{type}` already listed; `/new` is a sort view —
  omit to avoid near-duplicate URLs).

## Impact Analysis

- **Files touched**: `app/type-listing-page.tsx` (sort prop + toggle +
  pagination seam); 7× `app/{type}/page.tsx` (pass sort + five metadata
  exports); 7× new `app/{type}/new/page.tsx`; `lib/cache/revalidate.ts`.
- **No repo/SQL changes, no schema changes, no new dependencies.**
- **Blast radius**: listing default view changes (diversified order on
  page 1 of each type — chronological still fully available one click away);
  five title tags; two new cached route shapes. Detail pages, home, admin,
  pipeline untouched.

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build — green; build route table
  shows the seven new `/{type}/new` routes as `○ 1m` ISR; existing markers
  unchanged.
- Method 2 (dynamic, local prod server):
  - `/youtube` source distribution over the first 20 cards: max 3 per
    source (the flood is gone), ≥5 distinct sources present.
  - `/youtube/new` renders newest-first (top card = the same top card the
    old `/youtube` served — chronological preserved).
  - Toggle links present both directions; `/github` uses merged selection
    (trendshift AND opensource items on page 1); `/youtube/page/2` still
    chronological with "← Highlights" link.
  - The five title tags: `<title>YouTube - aggroNATION</title>` etc.
  - Second-hit cache check on `/youtube/new`: s-maxage=60.
- Method 3 (production, post-push): repeat flood + title probes against
  aggro-nation.vercel.app.
- Call-graph reachability: grep `sort=` in type-listing-page shows both
  branches; grep `getLatestContentDiversified\|getLatestContentMerged` in
  app/ shows listing callers; grep `new` route files exist ×7.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~25% | Audit caught: (a) the naive `?sort=` toggle would have reverted FID-012 — forced the path-based design; (b) diversified mode cannot paginate — defined the page-1/page-2+ seam explicitly instead of hand-waving; (c) `/new` must be added to the purge list or fetch cycles leave it stale; (d) GitHub page must use the merged selector, not single-type |
| 2 | GREEN → AUDIT | ~5% | Added: chronological page-2 "Newer" targets `/new` (not `/`, which is highlights); sitemap deliberately excludes `/new` (near-duplicate); metadata fallback note |
| 3 | AUDIT (convergence) | 0% | Convergence — loop terminated |

## Closure

Implementation evidence required before `closed`: commit SHA + local flood
probe (≤3 per source) + title-tag probe + `/new` route cache check +
production repeat of flood/title probes. Ground-truth rule applies.

## Implementation Evidence (2026-09-04)

- **Flood probe (local prod build :3100)**: `/youtube` badge distribution —
  max **2 per channel** across **14 distinct channels** (Wes Roth 2x,
  WorldofAI 2x, AI Revolution 2x, …); **"Julian Goldie SEO": 0**. Pre-FID
  production measured **16 of 20 cards** from that single channel.
- **Strict view**: `/youtube/new` renders raw newest-first (unfiltered
  chronology preserved — the honest archive view is not lost).
- **Title tags**: all 7 listing pages render `<title>{Type} - aggroNATION</title>`.
- **`/new` cache**: both probes return `x-nextjs-prerender: 1` with
  `s-maxage=60` — ISR, not dynamic (FID-012 property preserved).
- **Purge coverage**: `lib/cache/revalidate.ts` revalidates both route shapes.
- Status: `closed` — production evidence below.
- **Production (post-deploy, commit `aa962e7`)**: `/youtube` — Julian Goldie
  SEO **16/20 → 1**, every channel ≤2, 14+ distinct channels visible;
  `Highlights`/`Strict order` toggle live; `/github` title + toggle live.
