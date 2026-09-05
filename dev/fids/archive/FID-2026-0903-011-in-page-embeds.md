> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-011 — In-Page Embedded Playback (No Exit)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-011-in-page-embeds.md` |
| **ID**       | FID-2026-0903-011 |
| **Severity** | critical |
| **Status**   | verified (implementation complete — see evidence below) |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator product law ("we do not ever want a user to leave the website by clicking a video or article — EVERYTHING gets embedded on the site directly") |

## Summary

FID-007 shipped modal-based playback. The operator's ruling is broader and supersedes it: **no click may ever navigate a user away from the site.** A modal popup is not the requested experience — clicking a YouTube card must embed the player directly in the page, in place. Additionally, `/youtube` and `/about` are linked in the navbar but were never built (404s) — the /youtube route must render the embedded-grid experience the nav promises.

## Evidence (RED)

- Operator: "when you click a youtube video it is a popup, not an embedded page like it should be"; "'/youtube' is still a 404 page. same with about page"; "we do not ever want a user to leave the website by clicking a video or article, etc — EVERYTHING gets embedded on the sight directly."
- `components/home/YouTubeEmbed.tsx` (FID-007) — modal with `Modal.Backdrop/Container/Dialog`; playback is a popup, not in-page.
- `app/` contains no `youtube/` or `about/` route (glob) while `config/site.ts` navItems link both → 404.
- Footer/nav outbound references: navbar `GithubIcon` link (external) — outbound *navigation* allowed by the law's intent (leaving via a deliberate external link is not triggered by consuming content); the law governs content consumption clicks.

## Proposed Solution (GREEN)

1. **In-page expand/collapse player** (`components/home/YouTubeEmbed.tsx`, rewritten): clicking the thumbnail toggles an inline player section that expands **within the card** (thumbnail area replaced by the iframe, `youtube-nocookie.com`, autoplay). Second click (or Close button) collapses and unmounts the iframe (stops playback, releases bandwidth). No modal, no popup — the user stays on the exact scroll position. State: `useState<string | null>` per-card open state keyed by video id (only derived from `item.id`); no shared state → multiple cards may play independently (documented; grid of independent mini-players is the operator's stated model).
2. **`/youtube` route** (`app/youtube/page.tsx`): server component, ISR 300s like home; `getLatestContent({ sourceType: "youtube", limit: 24 })` → full embedded grid + section header; honest empty state on failure/empty. Route is the nav's "YouTube" promise fulfilled.
3. **`/about` route** (`app/about/page.tsx`): static server component describing the aggregator honestly (sources, ranking formula, refresh cadence) — matches FID-006's truthful-microcopy law.
4. **No-exit audit across content surfaces**: `ContentCard` non-youtube branch and any feed surfaces must never render outbound anchors for consumption; outbound links remain ONLY for deliberate non-content contexts (navbar GitHub icon, admin table source-url hint which opens nothing). FID-007's modal footer "Open on YouTube" link dies with the modal.

Alternatives considered: (a) facebox/lightbox overlays — still popups, rejected by operator ruling; (b) react-router-style intercepting routes (Next parallel/intercepting) — designed for URL-routed modals, complexity without in-page benefit; (c) replacing the grid with one large player + playlist rail — larger redesign than the ruling requires; revisit if operator wants TV-mode.

## Impact Analysis

- Modified: `components/home/YouTubeEmbed.tsx` (rewritten), `components/home/ContentCard.tsx` (unchanged branch, embed interface same), `config/site.ts` (no change needed — links already exist).
- New: `app/youtube/page.tsx`, `app/about/page.tsx`.
- No schema/API/dependency changes. Blast radius: youtube card interaction + two new public routes.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; build route table lists /youtube and /about.
- Method 2 (dynamic): dev server → `/youtube` 200 with grid markup; `/about` 200; home 200 with player surfaces; **no `target="_blank"` anchors on any content card** (grep served HTML for `youtube.com/watch` anchors → zero).
- Call-graph reachability: `grep -rn "getLatestContent" app/youtube/` → match; `grep -n "YouTubeEmbed" components/home/ContentCard.tsx` → unchanged wiring.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) keeping modal state at grid level would serialize playback; per-card state chosen to match "embedded page" model; (2) /youtube ISR window matches home (300s) for consistency; (3) collapsed-state iframe unmount preserves the no-YouTube-JS-on-page-view property from FID-007. Converged. |

## Closure

Requires: implementation file:line, static gates, route-table evidence, live route probes, operator confirmation that in-page playback matches intent.

## Implementation Evidence (2026-09-03)

- `components/home/YouTubeEmbed.tsx` rewritten: per-card `useState` expand/collapse — expanded state replaces the thumbnail with the in-place iframe (autoplay, nocookie host, Close button unmounts); no modal anywhere. FID-007's modal design is superseded (retained in that FID's history).
- `components/home/ContentCard.tsx` — non-youtube branch converted from outbound anchor to non-navigating card (no-exit law applied forward to fetchers not yet shipped).
- New routes: `app/youtube/page.tsx` (ISR 300s, `getLatestContent` limit 24, embedded grid + honest empty state incl. query-failure variant via `EmptyState.detailOverride`) and `app/about/page.tsx` (static, truthful copy: ranking formula, source statuses, in-site playback policy).
- Static: type-check + lint + build clean; route table: ○ /about, ○ /youtube (5m ISR).
- Dynamic: /youtube 200, /about 200, home 200; `<html class="dark">` present; **no-exit audit**: zero `youtube.com/watch` anchors and zero content `target="_blank"` in served HTML of / and /youtube — the only remaining `_blank` is the navbar GitHub project link (deliberate, non-content, documented exclusion).
- Pending for `closed`: operator confirmation of in-page playback UX.
- Status `verified`.