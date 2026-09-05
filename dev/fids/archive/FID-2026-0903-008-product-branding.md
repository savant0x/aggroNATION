# FID-008 — Product Branding (Logo + Favicon)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-008-product-branding.md` |
| **ID**       | FID-2026-0903-008 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator directive (silent deferrals revoked; completion ordered) |

## Summary

The navbar renders the HeroUI starter's default triangle glyph (`components/icons.tsx` `Logo` — a two-triangle path lifted from the Next.js/HeroUI template) and the favicon is the template default (`public/favicon.ico`). The product has no visual identity of its own; this is exactly the "default theme logo" the operator flagged.

## Evidence (RED)

- `components/icons.tsx:10-24` — `Logo` path data `M17.6482 10.1305L15.8785 7.02583L7.02979 22.5499...` is the HeroUI starter mark (two triangles), not aggroNATION branding.
- `public/` contains only the template `favicon.ico`.
- `components/navbar.tsx:37` renders `<Logo />` next to `siteConfig.name`; `app/layout.tsx:19-21` references `/favicon.ico`.
- Design system in place: dark "aggro neon" (FID-006) — accent gradient (`--color-accent` → `--color-accent-bright`), `--font-display`, grid textures.

## Proposed Solution (GREEN)

1. **`components/icons.tsx` — replace `Logo`'s path** with an original aggroNATION mark: a bold "A" chevron formed from two ascending signal bars (aggregation = collecting rising signals), drawn on the existing 32×32 viewBox, `fill="currentColor"` (inherits nav text color, works across themes exactly like the current mark). Deliberately abstract — no text-in-SVG (scales to 16px favicon cleanly).
2. **Gradient treatment:** navbar usage wraps the mark in a span with the existing `gradient-text` utility's background-clip technique so the mark itself carries the neon gradient (same tokens FID-006 established; no new colors).
3. **`public/favicon.svg`** — same mark, `currentColor` replaced with the accent hex pair via two-stop gradient definition; **`app/layout.tsx` icons** updated to `icon: "/favicon.svg"` with `favicon.ico` kept as fallback (Safari). Template ico replaced with the aggroNATION mark (binary ico generated from the svg geometry as static path-ico, minimal 32×32).
4. **Footer/nav consistency:** `<Logo />` is the single source (Law 13) — footer text-only, unchanged.

Alternatives considered: (a) wordmark-only logo — rejected: needs the mark for favicon/favicon-adjacent contexts (tab bar, bookmarks); (b) external logo file (png/svg in /public referenced by img) — rejected: inline SVG inherits theme colors and avoids an extra request; (c) hiring brand identity work — out of scope; this is the product's own mark in the established design language.

## Impact Analysis

- Modified: `components/icons.tsx` (Logo path only — other icons untouched), `app/layout.tsx` (icons metadata), `public/favicon.ico` (replaced), `public/favicon.svg` (new).
- No dependencies, no schema, no API changes. Blast radius: navbar + tab icon only.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean.
- Method 2 (dynamic): dev-server render of `/` → HTML contains the new path data (`grep` the served HTML for the new path's distinctive coordinate); `curl -I /favicon.svg` → 200.
- Visual: operator confirms the mark in the navbar (screenshot) — the operator is the acceptor for brand.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) gradient fill inside SVG would fight dark/light themes → keep `currentColor` + CSS gradient wrapper in nav, gradient only inside the standalone favicon svg where theme doesn't apply; (2) favicon.ico replacement needs a real multi-size ico → generate 32×32 from the same geometry, keep svg as the primary icon reference. Converged. |

## Closure

Requires: implementation evidence (file:line), served-HTML grep, favicon HTTP 200, operator visual confirmation.

## Implementation Evidence (2026-09-03)

- Static: type-check + lint + build clean.
- Implementation: `components/icons.tsx` — Logo path replaced with the aggroNATION "A"-chevron + signal-bar mark (two paths, currentColor, 32×32); `components/navbar.tsx` wraps it in the shared `gradient-text` utility; `public/favicon.svg` created (same geometry, accent gradient `#7c3aed → #22d3ee` on dark tile, matching the FID-006 neon palette); `app/layout.tsx` icons metadata → svg primary + ico fallback.
- Dynamic: served HTML greps the new path data (`M4 26L14 5H18L28 26...`) — FOUND; `GET /favicon.svg` → HTTP 200.
- Pending for `closed`: operator visual confirmation of the mark.
- Status `verified`.
