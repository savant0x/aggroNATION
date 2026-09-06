# FID-2026-0905-006

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-006-cyberpunk-repo-card.md` |
| **ID**       | FID-2026-0905-006 |
| **Severity** | minor |
| **Status**   | closed — verified |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator: custom cyberpunk-designed GitHub repo card for every card in the github section |

## Summary

Replace the current compact repo card (the inline `item.github` branch of
`ContentCard`) with a dedicated `RepoCard` component in the site's own cyberpunk
language — a "repo terminal file" panel. One component serves every grid that
renders repo items (/github merged, /trendshift, /opensource, /tags, /rising —
all funnel through `ContentCard`). Pure server component: no client JS, no new
dependencies, theme-token-driven so it survives light mode.

## RED — evidence (probed 2026-09-05)

1. Repo items render through exactly ONE branch: `ContentCard.tsx` lines 45–115
   (`if (item.github)`). Replacing that branch upgrades /github, /trendshift,
   /opensource, /tags/[tag], /rising simultaneously (Law 13: one card, one truth).
2. Data available on every repo item: `github` blob (slug, description, stars,
   forks, language, topics, license, pushedAt) — schema `githubRepoSchema`
   (content.ts:102). No fetch changes.
3. Design tokens: `--font-mono` (Fira Code) exists; accent `#7c3aed` /
   accent-bright `#22d3ee`; edge `#1d1d26`; light theme flips NEUTRALS only —
   so the card must use tokens, not hardcoded darks, and text colors must be
   legible on both (cyan-on-white fails contrast → slug uses `--color-accent`).
4. Existing semantics to preserve: Link → `/repo/{slug--}`, tag links →
   `/tags/{topic}`, source provenance, rating, `sr-only` origin link, stat
   title attrs.

## GREEN — design ("repo file" terminal panel)

- **Shape:** top-right corner clipped 14px (`clip-path` polygon) — the
  cyberpunk panel signature; content padding respects the cut.
- **Power stripe:** 36×2px accent bar, top-left; widens on hover.
- **Scanlines:** `repeating-linear-gradient` overlay at edge-token alpha
  (≈35%, pointer-events-none) — texture without noise, works in both themes.
- **Header row:** mono label `REPO //` + source name right (provenance kept).
- **Slug:** mono, accent color, trailing `_` caret in accent-bright (static —
  no blink, reduced-motion-safe by construction). Links to `/repo/{slug--}`.
- **Stats:** mono `tabular-nums` readouts ★/⑂ with title attrs; language dot.
- **Topics:** clipped-corner chips (hex-cut polygon), link to /tags as today.
- **Footer:** date left, rating as a clipped mono chip `[87]` right.
- **Hover:** border → accent-bright, corner glow via existing
  `--accent-bright-glow` token, stripe widen — glow only on interactive state
  (token contract from FID-006).

## Trade-offs

- `clip-path` on the card rounds nothing — the site's other cards stay
  rounded-2xl; this contrast is the point (repo items read as "terminal
  files"). Chip uses the same treatment for coherence.
- HeroUI `Chip` dropped on this card in favor of the clipped mono chip — the
  one deliberate divergence from the standard card furniture.

## AUDIT — verification plan

- Gates exit 0.
- Runtime: /github grid renders RepoCard for every repo item (DOM probe: count
  clipped panels = repo-item count); tags/source/rating/links present.
- Visual: preview screenshot before/after.
- Purity: component has no "use client", no Date.now(), no network.

## CLOSE — evidence (2026-09-05)

- Gates: type-check 0 errors, lint clean (also removed a `nowIso` orphan left
  by the FID-0905-004 momentum extraction), 62/0 tests, build compiles.
- Runtime: /github served 20/20 cards through the new component (40 HTML+RSC
  `repo-card` markers on the wire); full DOM audit — `REPO //` label,
  accent slug + caret, scanlines layer, tabular stats, topic chips, `[n]`
  rating chip, sr-only origin link — on every card. First probe miscounted
  (grep -c counts LINES; HTML is minified to one line) — corrected.
- Visual: dark mode screenshot — clipped corners, power stripes, scanlines
  and cyan-accent carets render as designed; light mode screenshot — purple
  slugs legible on white, chips/edges hold (the token contract worked).
- Purity: no "use client", no network, no Date.now(); glow only on hover via
  drop-shadow (box-shadow would be clipped by the silhouette).
