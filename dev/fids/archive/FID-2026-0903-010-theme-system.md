> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-010 — Theme System (React 19 Safe + Theme-Aware Tokens)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-010-theme-system.md` |
| **ID**       | FID-2026-0903-010 |
| **Severity** | major |
| **Status**   | verified (implementation complete — see evidence below) |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator bug report (console errors + invisible light-mode text) |

## Summary

Two defects share the theme layer. (1) `next-themes` renders an inline `<script>` inside the React tree; React 19 refuses to execute scripts rendered client-side and logs a console error on every client re-render of the provider tree — which the FID-009 dashboard triggers on every mutation via `router.refresh()`. (2) The custom "aggro neon" tokens in `styles/globals.css` (`--color-text-primary`, `--color-base`, …) are defined once in `@theme` and never change with the theme class, so in light mode body text stays `#f4f4f6` (near-white) on HeroUI's white background — invisible ("the colors for 'the signal' do not change").

## Evidence (RED)

- Operator console error A: `Encountered a script tag while rendering React component… at Providers (app/providers.tsx:14:10)` — next-themes' pre-hydration script re-rendered client-side.
- Operator report: light mode leaves hero/heading text unreadable.
- `styles/globals.css:11-30` — all custom tokens are static under `@theme`; `body { color: var(--color-text-primary) }` forces near-white in every theme.
- `app/layout.tsx:46` — `<html suppressHydrationWarning lang="en">` carries no theme class server-side; dark theme today depends entirely on next-themes' script.

## Proposed Solution (GREEN)

1. **Own the theme provider** (`components/theme-provider.tsx`): React context `{theme, setTheme}`, default `dark`, `localStorage` persistence (`aggronation-theme`), `useLayoutEffect` application before paint, `documentElement.classList.toggle("dark")` + `colorScheme`. No script element anywhere in the React tree — the console error is eliminated by construction.
2. **Server-render the dark default**: `<html className="dark">` — first paint is dark for everyone, no-JS included. Tradeoff (documented): light-preferring users see a brief dark first paint on cold visits until the layout effect applies their stored/system preference. React never rewrites the class on re-renders (vdom value unchanged; external mutation invisible to reconciliation), so the imperative toggle survives `router.refresh()`.
3. **Theme-aware tokens** in `globals.css`: `:root:not(.dark)` overrides for surface/text/edge/grid/glow tokens (light: `#f6f6f9` base, `#16161d` primary text, reduced glows). HeroUI's own semantic tokens already flip on `.dark` absence.
4. **`ThemeSwitch`** consumes the owned context (`theme === "light"`, `setTheme(...)`) — same UX, no library.
5. **Remove `next-themes`** (dependency + imports in `providers.tsx`, `theme-switch.tsx`). `app/providers.tsx` becomes a thin wrapper around the owned provider; `themeProps` plumbing deleted.

Alternatives considered: (a) upgrading next-themes — 0.4.6 is latest; the script-in-tree pattern is unchanged; (b) keeping next-themes and suppressing the warning — suppressing a real React 19 contract violation is Law-5 debt; (c) `<template>`-based injection — complexity without benefit for a two-theme toggle.

## Impact Analysis

- New: `components/theme-provider.tsx`. Modified: `app/providers.tsx`, `components/theme-switch.tsx`, `app/layout.tsx`, `styles/globals.css`. Removed dep: `next-themes`.
- Blast radius: every page (theme application) — but the contract (`.dark` on `<html>`, dark default) is identical to today's effective behavior.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; `grep -r "next-themes"` → zero matches in app source.
- Method 2 (dynamic): dev render → served HTML has `<html class="dark">`; no script-in-component error after `router.refresh()`-equivalent client render (admin flows); light-mode CSS overrides present in served stylesheet (`:root:not(.dark)` block).
- Call-graph reachability: `grep -rn "useTheme" components/` → theme-switch imports from the owned provider; `grep -rn "ThemeProvider" app/` → layout renders it.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) rendering `<html className>` from context is impossible (html wraps the provider) → static `className="dark"` + imperative toggle, reconciliation-safe because the vdom attribute never changes; (2) anti-FOUC script would reintroduce the React 19 violation → accepted documented dark-first-paint tradeoff instead; (3) `useLayoutEffect` (not `useEffect`) so stored preference applies before first post-hydration paint. Converged. |

## Closure

Requires: implementation file:line, static gates, served-HTML checks, zero `next-themes` references, operator light-mode confirmation.

## Implementation Evidence (2026-09-03)

- `components/theme-provider.tsx` — module-level external store + `useSyncExternalStore` (React's recommended pattern; no setState-in-effect, no layout-effect SSR warning), localStorage `aggronation-theme`, imperative `.dark` toggle + `colorScheme`. Zero script elements in the React tree.
- `app/providers.tsx` rewritten (thin owned-provider wrapper, `themeProps` plumbing deleted); `components/theme-switch.tsx` consumes the owned context; `app/layout.tsx` renders `<html className="dark">` server-side.
- `styles/globals.css` — `:root:not(.dark)` light-theme overrides for the neutral token family (base/surface/raised/edge/text-primary/text-muted/grid-line/glow), accent family unchanged (legible on both canvases).
- `npm uninstall next-themes` — dependency removed; `grep -r next-themes` over app source → zero matches.
- Static: type-check + lint + build clean. Dynamic: served HTML `<html lang="en" class="dark">`; light overrides present in stylesheet; FID-009 admin suite re-run after the change → 12/12 PASS (no regression from provider swap).
- Pending for `closed`: operator visual confirmation of light-mode legibility.
- Status `verified`.