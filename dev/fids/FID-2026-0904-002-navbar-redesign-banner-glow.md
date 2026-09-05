# FID-2026-0904-002

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-002-navbar-redesign-banner-glow.md` |
| **ID**       | FID-2026-0904-002 |
| **Severity** | minor |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 18–19 (per ECHO attribution rules, no agent names) |

## Summary

Operator verdict: the top navbar "looks terrible and not AAA quality", while the home banner is liked but should carry a glow. The navbar is a generic starter bar — flat `bg-background/70` strip, unstyled text links, a 5-type product navigated by only 3 links (Home/YouTube/About), no active-route state, and none of the site's "aggro neon" design language (gradient/glow tokens exist and are used by cards and CTAs, never in the chrome). The banner renders as a flat full-width image with a single faint hairline.

## Evidence (RED)

- `components/navbar.tsx` — plain strip: `border-b border-separator bg-background/70 backdrop-blur-lg`; text-only links without active states; desktop nav = `siteConfig.navItems` (Home, YouTube, About only) while the product has five content types (`/youtube /rss /reddit /x /huggingface` — all live, all FID-022/019 routes); GitHub icon and theme switch float ungrouped.
- `config/site.ts:9-24` — navItems list confirms the missing type pages.
- `components/home/HeroSection.tsx` — banner img + one `gradient-line h-px opacity-40` hairline; no depth.
- `styles/globals.css` — the design system the navbar ignores: `--accent-glow`, `.glow-accent`, `.gradient-text`, `.gradient-line`, `.card-interactive` hover language.

## Proposed Solution (GREEN)

**Navbar (rewrite `components/navbar.tsx`, extend `config/site.ts`):**
1. **Bar chrome** — layered surface gradient + heavier blur; bottom border replaced by a `gradient-line` accent hairline (the site's signature edge).
2. **Brand** — logo (28px) in a glowing bordered tile + wordmark in the display font with `.gradient-text`; hover intensifies the glow.
3. **Full navigation** — navItems extended with RSS, Reddit, X, HuggingFace, About. Pill-style links (`usePathname` active state: raised pill + accent text; inactive: muted → primary on hover). Desktop search slimmed to fit; Kbd suffix xl-only.
4. **Actions cluster** — GitHub, theme switch, search, and AuthNav grouped in one bordered `<ul>` (AuthNav's `<li>` children stay valid HTML; component untouched, Law 13).
5. **Mobile sheet** — restyled to match: blurred surface, pill links, same full item list.

**Banner glow (`HeroSection` + one CSS utility):** container-level `banner-glow` bloom (dual-layer accent shadows, theme-tuned like `.bg-pattern-veil`: stronger in dark, softer in light) + mirrored top/bottom `gradient-line` edges. Banner stays natural-ratio and alone in the hero (rev 3 decision preserved).

Alternatives considered: HeroUI Navbar component (its API fights the custom token system — hand-rolled markup already owns it); scroll-shadow listener (restraint — extra client work for marginal gain); CSS `filter: drop-shadow` on the img itself (glows the image content, not the hero — wrong tool).

## Impact Analysis

- Modified: `components/navbar.tsx` (rewritten), `config/site.ts` (navItems), `components/home/HeroSection.tsx` (glow layers), `styles/globals.css` (+`.banner-glow`).
- No schema/repo/route changes; every page inherits the navbar; home inherits the hero glow.
- Blast radius: visual chrome only. AuthNav/ThemeSwitch interfaces unchanged.

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check`, `npm run lint`, `npm run build`.
- Method 2 (dynamic): served HTML of `/` contains all 7 nav hrefs, the gradient hairline, brand tile, and banner-glow markup; assets unchanged.
- Call-graph reachability: `grep -rn "banner-glow\|gradient-line" components/ styles/`; navbar imports unchanged (`@/components/navbar` in `app/layout.tsx:11,34`).

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Operator: navbar is the offender; "i like the banner, maybe add a glow"; sections/count fine — untouched. |

## Closure

Implementation evidence:
- `components/navbar.tsx` (rewritten): gradient-line hairline + layered blur chrome; brand tile (h-9 w-9, glow-accent, group-hover bright glow); pill nav with `isActivePath` + aria-current across all 7 destinations; grouped actions cluster (`<ul>` bordered pill wrapping GitHub/ThemeSwitch/search — AuthNav `<li>` children remain valid HTML); mobile sheet restyled to match.
- `config/site.ts` — navItems: Home, YouTube, RSS, Reddit, X, HuggingFace, About.
- `components/home/HeroSection.tsx` — banner wrapped in `.banner-glow` + mirrored top/bottom `gradient-line` edges (natural ratio preserved).
- `styles/globals.css` — `.banner-glow` utility, theme-tuned (dark stronger, light softer).

Gate results: type-check PASS, lint PASS, build PASS. Dynamic (dev :3000): home HTTP 200; all 7 nav hrefs present in served markup (2× = desktop + mobile sheet); `banner-glow` wrapper present (SSR + RSC payload); hairlines + brand tile confirmed. Reachability: navbar mount unchanged (`app/layout.tsx:11,34`); `grep banner-glow` → HeroSection.tsx + globals.css.

Full `closed`/archive remains gated on `git init` (G2) — open operator decision.
