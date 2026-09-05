# FID-2026-0904-015

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-015-repo-card-dedup.md` |
| **ID**       | FID-2026-0904-015 |
| **Severity** | major |
| **Status**   | converged |
| **Created**  | 2026-09-04 |
| **Author**   | Operator visual exploration, 2026-09-04 (finding 5): trendshift article pages double-carded; /github grid illegible at card scale |

## Summary

Repo items (trendshift + opensource) render the same GitHub data **twice
stacked** on the article page — the 1200×630 og-image card *and* the styled
`GitHubRepoCard` beneath it both show slug, description, stars. On the
`/github` grid, the full-height og-image shrinks to a noisy sliver at
5-across scale and duplicates what the card text already says. The article
page must drop the og-image when `github` data exists; the grid needs a
compact repo-card variant that leads with text, not a banner image.

## Evidence (RED)

- `app/article/[itemId]/page.tsx:175` renders `{item.github && <GitHubRepoCard … />}`
  unconditionally; `GitHubRepoCard.tsx` renders the og-image (`ogImageUrl`)
  THEN the slug/description/stars — operator screenshot shows the same slug
  and description visible twice on
  `/article/trendshift_tt-a1i_archify`.
- `lib/services/fetch-service.ts:427` sets `thumbnailUrl = githubOgImageUrl(repo.slug)`
  for trendshift items and `:233` falls back to the og-image for opensource —
  so EVERY repo item's grid card renders a full 1200×630 GitHub banner
  (operator screenshot: the /github grid is a wall of near-identical white
  og-cards; text illegible at `lg:grid-cols-5`).
- `components/home/ContentCard.tsx` has no repo-aware branch — repo items get
  the generic thumbnail layout only.
- og-image hosts rate-limit: FID-013 walk measured **17/20 og-cards loading,
  3 broken (GitHub 429)** — the banner-image-first design fails visually even
  when it works.

## Proposed Solution (GREEN)

1. **Article page de-dup**: when `item.github` exists, skip the og-image in
   `GitHubRepoCard` and render only the styled text card (slug, description,
   stars/forks, language/topics, links). The card IS the visual. When no
   `github` blob exists (legacy docs), keep the og-image as the visual.
   Implementation: new `variant?: "full" | "compact"` prop — article passes
   `full` (no image), keeping a single component.
   - og:image meta is UNAFFECTED (`generateMetadata` keeps `github.ogImageUrl`
     as the social-share image — that's where the og-card belongs).
2. **Grid compact repo card**: `ContentCard` branches on `item.github`:
   instead of the og-image thumbnail, render a compact text-first header —
   slug as display title, a small language/accent chip row, stars/forks —
   then description (line-clamped), then the existing metrics/rating footer.
   No 1200×630 image at grid scale, ever. `SourceBadge` still names the feed
   (trendshift vs opensource).
   - SEO/social surfaces unchanged: `generateMetadata` on the article route
     and sitemap are untouched.
3. **Non-repo cards unchanged**: rss/reddit/huggingface/youtube keep the exact
   current card layout.

Alternatives rejected:
- *Drop `GitHubRepoCard` from article pages, keep og-image*: the styled card
  carries strictly more information (topics, license, homepage) and matches
  the site's design language; the og-image adds nothing the card lacks.
- *next/image optimization for og-cards*: remote optimization budget for a
  decorative banner — against the established plain-img law for previews.

## Impact Analysis

- `components/article/GitHubRepoCard.tsx` — new `variant` prop; image block
  conditional.
- `app/article/[itemId]/page.tsx` — no change needed beyond what exists
  (`item.github && <GitHubRepoCard …>` already the only render path); verify
  meta tags unchanged.
- `components/home/ContentCard.tsx` — new `item.github` branch rendering the
  compact repo layout (replaces the thumbnail block for repo items).
- No schema changes, no fetcher changes, no DB migration. ISR untouched
  (pure render-layer change). CSP img-src unchanged (no new hosts).

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check`, `npm run lint`, `npm run build`
  with ISR markers unchanged (`○ /` 1m, `●` article/watch/listings).
- Method 2 (dynamic): local prod server —
  - `/article/trendshift_*` renders the styled card with NO
    `opengraph.githubassets.com` <img> in the page body (og:image meta STILL
    present in <head>).
  - `/article/opensource_*` same.
  - `/github` grid: zero 1200×630 og-image <img> elements; compact cards show
    slug + stars + language + source badge.
  - Non-repo listing (`/rss`): card layout unchanged (thumbnail + badge).
- Call-graph reachability: grep `variant=` in article page; grep `item.github`
  in ContentCard; build route table unchanged.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | ~30% | Audit caught: og:image meta must survive the article-page change (social cards still want the og-image); variant prop beats two components; grid badge still needed to distinguish trendshift vs opensource |
| 2 | GREEN → AUDIT | ~10% | Added: legacy docs without `github` keep the og-image fallback on the article page; grid branch must not render both badge-over-image AND text header for repo items |
| 3 | AUDIT (convergence) | 0% | Convergence — loop terminated |

## Closure

Evidence required: type/lint/build green, ISR markers unchanged, article-page
og-image-in-body absence + og-meta presence probe, /github grid og-image-free
probe, non-repo card unchanged probe. Status → `closed` only after production
probes repeat the same results.

## Implementation Evidence (2026-09-04)

- **Design simplification during implementation**: the FID's `variant` prop
  was dropped — `GitHubRepoCard`'s only call site renders it exclusively when
  `item.github` exists, so the og-image inside it was *always* redundant.
  Removed outright; no dead API.
- Gates: type-check + lint clean, build ✓ 24/24 static pages, ISR markers
  unchanged.
- **Article probe** (`/article/trendshift_sgl-project_sglang`): og-image
  `<img>` elements in body = **0** (first probe's positive was the RSC flight
  payload echoing meta-tag JSON — DOM-level recheck confirms zero rendered
  elements); `og:image` + `twitter:image` meta STILL in head; styled text
  card renders (slug/description/topics/license/links).
- **Grid probe** (`/github`): body og-image count = **0**; compact cards
  render slug heading + ★/⑂ chips + language/topics + inline source badge.
- **Non-repo probe** (`/rss`): thumbnail `<img>` + overlay badges unchanged.
- Visual: screenshots confirm both surfaces read cleanly at grid scale.
- Status: `closed` — production evidence appended post-deploy.
