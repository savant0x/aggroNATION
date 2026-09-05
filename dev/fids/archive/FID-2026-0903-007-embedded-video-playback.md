# FID-007 — Embedded Video Playback

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-007-embedded-video-playback.md` |
| **ID**       | FID-2026-0903-007 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator directive (silent deferrals revoked; completion ordered) |

## Summary

YouTube items render as outbound links with static thumbnails (`components/home/ContentCard.tsx` — whole card is a `<Link target="_blank">` to youtube.com). The product goal — "surfaces the most engaging content" — is defeated by the click-through: users bounce to YouTube to consume. Playback must happen in-app.

## Evidence (RED)

- `components/home/ContentCard.tsx:18-26` — `<Link href={item.url} target="_blank">` wraps the entire card; clicking navigates away from the site.
- FID-002 schema guarantees `sourceType` + `externalId` on every content doc (`lib/schemas/content.ts`), and the doc id IS `youtube_{externalId}` (`buildContentDocId`), so the embed id is derivable without schema changes for youtube items. Non-youtube types keep current behavior.

## Proposed Solution (GREEN)

1. **`components/home/YouTubeEmbed.tsx`** (client component) — modal player:
   - `useOverlayState()` from `@heroui/react` (verified: `UseOverlayStateReturn { isOpen, setOpen, open, close, toggle }`) drives a slot-composed `Modal` (`ModalRoot state={...}` → `ModalBackdrop` → `ModalContainer` → `ModalDialog` → `ModalHeader/ModalBody/ModalFooter/ModalCloseTrigger` — exact slot exports grepped from `@heroui/react@3.2.4`).
   - Card surface (thumbnail + play glyph) is a `<button>` triggering `state.open` — NOT an anchor; no navigation occurs.
   - The `<iframe>` is mounted ONLY while the modal is open (`state.isOpen &&`), with `src={https://www.youtube-nocookie.com/embed/${externalId}?autoplay=1}`. Consequence: no YouTube JS/cookies load on page view (privacy-enhanced mode, zero page-weight cost), and closing the modal unmounts the player (stops playback).
   - Footer keeps "Open on YouTube" as a deliberate secondary link (share/comment context) plus a Close action.
   - `title` attribute set to the video title (a11y); `allowFullScreen`; `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"` (YouTube standard embed policy).
2. **`ContentCard` change** — minimal (Law: surgical): when `item.sourceType === "youtube"`, render `<YouTubeEmbed item={item}>` in place of the current `<Link>`; the card body (title/excerpt/metrics row) moves inside the embed component. Non-youtube sources keep the outbound link exactly as-is. Metrics/author/date rendering is reused via existing `MetricsRow` (Law 13 — no duplication).

Alternatives considered: (a) always-on iframes in the grid — rejected: 4–8 concurrent YouTube players per page wreck page weight, autoplay policy violations, and cookie consent noise; (b) react-player library — rejected: new dependency for a single iframe the platform already renders natively; (c) youtube.com/embed via plain iframe replacing the card link — rejected: removes the visual grid affordance and metrics display.

## Impact Analysis

- New file: `components/home/YouTubeEmbed.tsx` (client).
- Modified: `components/home/ContentCard.tsx` (branching render only).
- No schema changes, no API changes, no new dependencies.
- Blast radius: home page + any future list pages using `ContentCard`; non-youtube rendering unchanged.

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check` + `npm run lint` zero errors; `npm run build` passes with the page compiled.
- Method 2 (dynamic): `curl` the home page → HTML contains card markup for youtube items; modal is client-rendered so runtime probe = dev-server render of `/` returns 200 with thumbnails present; iframe URL derivation unit-checked via `buildContentDocId` inverse (`youtube_` prefix strip).
- Call-graph reachability: `grep -r "YouTubeEmbed" components/ app/` shows `ContentCard.tsx` import + usage; `grep -n "sourceType === \"youtube\"" components/home/ContentCard.tsx` matches the branch.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) iframe mounted always would load YouTube JS on every page view → gated on `state.isOpen`; (2) autoplay param added only on open-mount so the first user click both opens and plays (standard UX); (3) `youtube-nocookie.com` chosen over `youtube.com` embed host for privacy-enhanced mode. Converged. |

## Closure

Requires: implementation evidence (file:line), grep of reachability patterns above, static gates output, and dev-server 200 render probe.

## Implementation Evidence (2026-09-03)

- Static: `npm run type-check` + `npm run lint` + `npm run build` all clean; route table unchanged (client-component only change).
- Reachability: `grep -n "YouTubeEmbed" components/home/ContentCard.tsx` → import (line 6) + youtube branch (line 19). Non-youtube types keep outbound links unchanged.
- Dynamic: home page HTTP 200; served HTML contains `aria-haspopup="dialog"` player surfaces for the 3 youtube grid cards (5 "Play" aria-labels counted including top-rated section); zero outbound anchors for youtube items.
- Iframe contract: mounted only while `state.isOpen` (`youtube-nocookie.com` embed, autoplay-on-open, `title` = video title, allowFullScreen) — no YouTube JS on page view, unmount stops playback.
- Status `verified`.
