> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-021 — Banner Header, Sortable Sources, 20/Page Type Pages

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-021-banner-sorting-pagesize.md` |
| **ID**       | FID-2026-0903-021 |
| **Severity** | minor |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator batch report |

## Summary

Four operator items: (1) the home hero header should use the operator-provided `public/banner.jpg` (1024×434) instead of the decorative gradient; (2) type listing pages (/rss, /youtube, /reddit, /x) should show **4 rows of 5 = 20 per page**; (3) the rss page needs a **back button**; (4) source management's NAME and TYPE column headers should **sort alphabetically on click**.

## Evidence (RED)

- Operator: "on the actual pages like /rss youtube, etc, it should show 4 rows"; "For the rss page view, it needs a 'back' button as well"; "the title bars, name and type should allow sorting in alphabetical order by clicking the title bar"; "for the page header, use this …public/banner.jpg".
- `app/type-listing-page.tsx`: PAGE_SIZE=15; no back affordance.
- `components/admin/SourceTable.tsx`: static column labels, unsorted rendering.
- `components/home/HeroSection.tsx`: CSS-only decorative background (grid texture + radial glow), no banner asset.
- `public/banner.jpg` exists on disk (1024×434 JPEG, operator-added).

## Proposed Solution (GREEN)

1. **Banner header** — HeroSection background becomes `/banner.jpg` (`object-cover`, aria-hidden) with a theme-aware scrim (`color-mix` on `--color-surface`) plus the existing radial glow, so hero text stays legible in both themes.
2. **20 per type page** — type-listing PAGE_SIZE 15 → 20 (4 rows of 5). Home sections stay at 15 (3 rows) — the operator's request names the type pages explicitly, and home stacks 4 sections where 20/section would bury the fold.
3. **Back button** — shared type-listing header gains "← Back to home" above the h1 (applies to all four type pages, which is where the operator wants it).
4. **Sortable columns** — SourceTable holds local sort state `{key: name|type, dir}`; clicking the NAME or TYPE header toggles asc/desc (arrow indicator, aria-label). Sorting applies to the full list before pagination, case-insensitive (`localeCompare`, base sensitivity). HeroUI's react-aria Table sorting machinery isn't needed — a button inside the column header with owned state avoids unverified API surface (robustness over cleverness).

Alternatives: server-side sorting via query params — sources fit in memory, client sort is instant and survives router.refresh; next/image for the banner — one static public asset, plain img avoids the optimization config for marginal gain (same call as card thumbnails).

## Impact Analysis

- Modified: `components/home/HeroSection.tsx`, `app/type-listing-page.tsx`, `components/admin/SourceTable.tsx`.
- Blast radius: presentation only — no data, API, or pipeline changes.

## Verification Plan (AUDIT)

- Static: type-check + lint + build.
- Dynamic (operator's dev server): home serves banner.jpg reference with scrim markup; /rss contains back link and 20 card links (or total if smaller); admin table — sort behavior is client-side, verified by markup (buttons in headers with indicators) + a unit-style sort probe of the comparator; pagination still clamps.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) sort must precede the pagination slice (sorting only the visible page would be a bug); (2) the clamp (`safePage`) must use the sorted list's length — identical, but keep the ordering explicit; (3) banner scrim must derive from theme tokens, not hardcoded black, to survive light mode. Converged. |

## Closure

**Status: VERIFIED 2026-09-03 — live against the operator's dev server.**

- **Banner rev 3 (operator follow-up): banner restored to its natural aspect ratio (`h-auto w-full`, no object-cover crop) and the hero is the banner ALONE — CTAs and top-rated chip removed (they cluttered the design; nav links to /youtube and /about exist in the navbar, and the Top rated section below carries the top-item info). sr-only h1 retained. Verified in served HTML: banner img with `h-auto w-full`, zero hero buttons/chip markup.
- **Banner rev 2 (operator follow-up): the banner image carries the branding text itself, so the overlaid hero copy (chip, h1, tagline) and the scrim were removed.** A visually-hidden `<h1>` (sr-only) keeps an accessible page heading for screen readers/crawlers.
- Banner: `src="/banner.jpg"` present in served home HTML; asset serves 200.
- 20 per type page: /rss renders 20 cards (4 rows of 5). Data quirk surfaced during the probe, recorded not fixed (separate concern): arXiv's feed carries the same paper under both versioned and unversioned guids (`…02649v1` / `…02649`) → two doc ids for one paper; deterministic-id dedupe cannot catch cross-guid dupes (known FID-002 hazard class).
- Back button: "← Back to home" present on /rss and all type pages via the shared component.
- Sortable columns: NAME/TYPE headers are buttons with arrow indicators (markup in the compiled dashboard chunk; anonymous curl correctly cannot see /admin — 307 boundary held). Comparator unit-probed: case-insensitive asc ordering correct (`A, a2, b, C`); type alphabetical (`reddit, rss, x, youtube`). Sort applies to the full list before the pagination slice; direction toggles on repeated clicks.
- **Banner rev 4 (operator follow-up): operator's bg.jpg pattern added as the full-page background** — fixed attachment (doesn't scroll), tiled via background-repeat, dimmed so it's barely visible. Two fixed decorative layers beneath the content wrapper (raised to z-10) in the root layout; pointer-events-none, aria-hidden.
- **Banner rev 5 (operator follow-up): theme-tuned veil** — dark mode lets more of the pattern through (75% black veil), light mode is lighter-touch (92% white veil, keeping the clean white feel with a hint of texture). Implemented as `.bg-pattern` / `.bg-pattern-veil` in globals.css (`:root:not(.dark)` override); both rules verified in the compiled CSS.
- **Visual-sweep finding (sort regression report): the sort was never broken — the DATA was.** Operator reported names sorting wrong; investigation via real Firestore reads found three source names with LEADING WHITESPACE (" r/singularity", " r/BlackboxAI_", " r/vibecoding"), and whitespace (char 32) sorts before every letter, pushing them to the top of "ascending". The comparator itself was correct all along (verified both in-page and on the full list).
  - Fixed at the boundary (repo layer): `createSource`/`updateSource` now trim `name`/`url` so dirty data can never be written again.
  - Existing records repaired via one-off idempotent script `scripts/repair-source-name-whitespace.ts` — 3 docs trimmed, verify pass: 0 still-dirty.
  - End-to-end verified on a fresh dev session: Name asc = `AI Agents Studio, AI Revolution, AICodeKing, …`, desc = `Z.ai, WorldofAI, …`; Type asc = `reddit → rss → x`; arrows flip (↑/↓); sort applies to the full list before the pagination slice.
  - Diagnostic note for future sweeps: during one dev-server session, clicks on the SSR DOM were no-ops (React never hydrated — dead HMR websockets, no fiber markers on DOM nodes). If clicks "do nothing" in dev, check hydration before blaming component code; a server restart fixes it.
- Static: type-check, lint, build clean.

Requires (outstanding): operator visual pass — banner legibility in both themes, sort feel, pagination at 20.