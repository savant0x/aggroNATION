# FID-2026-0904-005

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-005-signal-navbar.md` |
| **ID**       | 2026-0904-005 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 18–20 (per ECHO attribution rules, no agent names) |

## Summary

Operator verdict on the FID-2026-0904-002 navbar revision: "looks even worse now — you keep using the boilerplate, design it yourself." Correct critique: the revision *added* chrome (bordered brand tile, pill links with background fills, a bordered actions cluster) — the component-kit vocabulary the operator is rejecting. A premium bar for an aggregator brand needs subtraction and one strong idea, not boxes.

## Evidence (RED)

- `components/navbar.tsx` (current state): brand inside a bordered glowing tile; every nav link rendered as a filled pill (`rounded-full bg-[var(--color-raised)] shadow-[inset…]`); the right cluster wrapped in a bordered rounded-full box; gradient hairline across the full bar width. Hierarchy is lost — everything is a widget.
- Operator directive: no boilerplate; design from first principles.

## Proposed Solution (GREEN)

**"Signal bar" concept — the nav IS the product story (aggregation of live signals):**

1. **No boxes anywhere.** Bar: no border, no gradient strip, no card surfaces — just `bg-[var(--color-base)]/55 + backdrop-blur-xl` at h-14 (slimmer than 16). Space does the work.
2. **Type-led brand.** Lowercase `aggronation` wordmark in the display font, bold, tight tracking — no SVG mark in the bar (the favicon owns the tab). Next to it, the signature: a 6px **pulsing signal dot** in accent-cyan with a soft glow — CSS keyframes only, `prefers-reduced-motion` honored. It says what the product is: the pipeline is alive.
3. **Editorial links.** Uppercase 12px, wide tracking, plain text — active state is text-brightening plus a 1px `gradient-line` underline *under the active item only* (not a full-width strip); hover shows the same underline at 60% opacity. No fills, ever.
4. **Quiet utilities.** Search as a borderless input (bottom border appears only on focus), GitHub + theme as bare icons, auth state as plain text — one row, gap spacing, no container.
5. **Mobile** — same language: bare icon button, sheet = translucent blur, plain uppercase list + auth.

Removed vs FID-002: brand tile, pill fills, actions-cluster box, full-width hairline, Kbd hint.

Alternatives: mega-menu with type icons (over-built for 7 links); transparent-over-hero-only (inconsistent once scrolled); centered logo layout (kills scanability for a content index).

## Impact Analysis

- Modified: `components/navbar.tsx` (rewritten again), `styles/globals.css` (+ `.signal-dot` + keyframes).
- Reverted-to-simplicity: all FID-002 chrome classes leave the bar; `gradient-line` remains used (active underline + HeroSection edges). AuthNav/ThemeSwitch untouched.
- Blast radius: visual chrome only; all pages inherit.

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build.
- Method 2 (dynamic): served home HTML — no pill/tile classes from FID-002 remain, signal-dot + wordmark present, active underline rendered on `/`, all 7 nav hrefs intact.
- Call-graph: navbar mount unchanged (`app/layout.tsx`).

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Operator rejection of chrome-heavy revision → subtraction-first design. |

## Closure

Implementation evidence:
- `components/navbar.tsx` rewritten to the signal bar: h-14, `bg-[var(--color-base)]/55 + backdrop-blur-xl`, NO borders/fills/pills/tiles anywhere in the chrome; brand = `.signal-dot` + lowercase display-font wordmark; nav = uppercase 12px/0.14em links whose only state is a 1px `gradient-line` underline under the active item (hover 60%); utilities bare (borderless search with focus-only bottom border, bare GitHub icon, ThemeSwitch, AuthNav in a real `<ul>` for valid HTML — its children are `<li>`); mobile sheet = blur + dotted active markers; `prefers-reduced-motion` honored by the signal dot.
- Removed (probe-verified: 0 matches in served HTML): FID-002's brand tile glow class, pill link classes, bordered actions cluster.
- `styles/globals.css`: + `.signal-dot` + `signal-breathe` keyframes.
- Gates: type-check PASS, lint PASS, build PASS.
- Dynamic (dev :65083, home): signal-dot 1, wordmark 1, 6/6 nav hrefs, old chrome 0. Operator visual pass pending.
- Dev-server note: port 3000 became unrecoverable after the production build (stale .next port state, as recorded in the prior session); server restarted on :65083.
