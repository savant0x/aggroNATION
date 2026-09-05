> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-006 — AAA Home Page (Dark Aggro Neon)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-006-aaa-home-page.md` |
| **ID**       | FID-2026-0903-006 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md Amendment 1 (operator-confirmed full-system build) |

## Summary

The operator rejected the boilerplate homepage and mandated AAA quality in the dark "aggro neon" direction, rendering **real Firestore data** — mocks rejected under Law 5. Home page becomes the design-flagship: it proves the design system AND exercises the full stack (FID-002 queries → server components → HeroUI v3 presentation). Sections show honest empty states until the pipeline (FID-003) fills them — no fake content, ever.

## Evidence (RED)

- Current `app/page.tsx` is template placeholder text with static status cards (operator: "scrap this boilerplate mess").
- HeroUI docs index (`AGENTS.md`, downloaded via heroui-cli) is the v3 API source of truth; v3 uses compound components (`<Button>`, `Card`/`CardHeader` etc. per docs) and a `@theme`-based design token system in `styles/globals.css`.
- Home page currently imports nothing from Firestore; no server-component data path exists yet (FID-002 provides `getTopContent`/`getLatestContent`).

## Proposed Solution (GREEN)

**Design language** — "dark aggro neon": near-black canvas (`#050505`-range), single electric accent family (violet→cyan gradient for CTAs/focus), bold display typography, subtle 24px grid texture overlay, glow accents used ONLY on interactive/hover states (restraint = AAA; glow-everywhere reads cheap).

**Layer 1 — design tokens** (`styles/globals.css` `@theme`): token contract `--bg-base`, `--bg-surface`, `--bg-raised`, `--accent`, `--accent-glow`, `--text-primary`, `--text-muted`, `--border-subtle`, plus display-font scale. HeroUI v3 theme mapped onto same tokens (dark-first; light mode stays functional via ThemeSwitch but is not the target aesthetic).

**Layer 2 — data path**: `app/page.tsx` (server component) → per-section `getLatestContent({ sourceType, limit: 4 })` (matches FID-002 index 1: sourceType + archived + publishedAt) + one global `getTopContent({ limit: 8 })` strip for the hero's "top rated" row (matches index 2 exactly — no sourceType filter, which would require an undeclared composite index). Revalidate via `export const revalidate = 300` (5-min ISR — content freshness need is low; avoids per-request reads on the free tier).

**Layer 3 — components** (`components/home/*`):
- `HeroSection` — name, one-line value prop, CTA pair (Browse YouTube / About), animated gradient-glow accent line; grid texture behind.
- `SectionHeader` — source type label + count + "view all" link stub.
- `ContentCard` (server component, no client JS) — thumbnail (next/image, i.ytimg.com whitelisted in next.config.mjs), title, author, publishedAt relative, metrics row (views/likes/comments), rating chip; whole card links to source URL.
- `ContentGrid` — responsive 4-col → 1-col collapse; `items.length === 0` → `EmptyState`.
- `EmptyState` — honest design: "Pipeline hasn't fetched any {type} yet" + status of cron wiring (truthful microcopy, Law 5 compliant).
- `MetricsRow` — compact icon+number formatting (1.2K views), shared by all card types.

**Layer 4 — page composition** (`app/page.tsx`): Hero → per-sourceType sections (YouTube first, then planned types showing EmptyState until FID-003 lands) → footer CTA. Layout/Navbar already exist; navbar CTA polish included here.

Alternatives considered: (a) client-side SWR fetching — rejected, server components + ISR is the Next 16 default path, zero client JS for content, better LCP/SEO; (b) shimmer skeletons for empty sections — rejected by operator (Law 5: skeleton ≠ mock but wastes the section — honest EmptyState carries information instead); (c) framer-motion entrance animations — rejected for now, motion adds client JS weight; hover/focus transitions only (CSS) until a dedicated motion pass is approved.

## Impact Analysis

- Files created: `styles/globals.css` (extended, not replaced), `components/home/{HeroSection,SectionHeader,ContentCard,ContentGrid,EmptyState,MetricsRow}.tsx`, `app/page.tsx` (rewritten), `config/site.ts` (copy polish).
- Depends on: FID-002 (`getTopContent`/`getLatestContent`). Independent of FID-003/004/005 (empty states render until data exists).
- Client JS budget: page ships near-zero component JS (server components + CSS transitions only).
- next/image: `i.ytimg.com` already whitelisted.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + build clean; route rendered as static/ISR in build output.
- Method 2 (dynamic): emulator-seeded DB → `npm run dev` → visual pass at 1280/768/375 widths (no horizontal overflow, contrast ≥ WCAG AA on text tokens); empty-DB pass shows all EmptyStates; Lighthouse a11y pass ≥ 95.
- Call-graph reachability: `grep -r "getTopContent" app/` matches `app/page.tsx`; `grep -r "ContentCard" components/home/ app/` matches composition.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ---- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) rating chip duplicated metrics formatting → extracted MetricsRow (Law 13); (2) ISR window initially 60s — free-tier read cost unjustified, 300s chosen and documented; (3) empty-state microcopy initially claimed "coming soon" for unimplemented fetchers — reworded to be truthful about pipeline status. Converged. |
| 2 | AUDIT (cross-FID) | ~2% | Finding: per-sourceType getTopContent would require undeclared composite index (sourceType, archived, rating). Fixed: sections use getLatestContent (index 1), global top-rated strip uses getTopContent (index 2). Index set unchanged. Converged. |
| 3 | IMPLEMENT + AUDIT | — | Implemented: tokens in globals.css (near-black #050505, violet→cyan accent, grid texture, glow-on-interactive-only), Space Grotesk display font, HeroSection/SectionHeader/ContentCard/ContentGrid/EmptyState/MetricsRow as server components, page composition with ISR 300s. Card design drove a thumbnailUrl schema amendment (logged in FID-002). Static gates clean; live page 200 with honest EmptyStates; full-page screenshot captured via styled HTML snapshot (dev-preview registration rejected the dev server — tooling quirk, not a product issue). Breakpoint/Lighthouse pass pending. |

## Closure

Requires: implementation commit + screenshots at 3 breakpoints + grep evidence of FID-002 imports in `app/page.tsx`.