# FID-2026-0904-001

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-001-type-fallback-images.md` |
| **ID**       | FID-2026-0904-001 |
| **Severity** | minor |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 1–17 (per ECHO attribution rules, no agent names) |

## Summary

Operator provided branded card images for the content types (`public/rss.jpg`, `public/x.jpg`, `public/reddit.jpg`, `public/huggingface.jpg`). Cards currently render a bare letter placeholder (R/X/H) whenever an item has no origin thumbnail — which is nearly always for reddit (Atom feed carries no images), x (API v2 tweet objects expose no image in the fields requested), and huggingface (daily_papers has no image), and often for rss. The branded images are unused. Cards should show the operator's branded image per type whenever no real thumbnail exists; real thumbnails must always win when present.

## Evidence (RED)

- `components/home/ContentCard.tsx:25-45` — `item.thumbnailUrl ? <img …/> : <letter placeholder>`; letter branch used for reddit/x/huggingface items and thumbnail-less rss items.
- `components/home/YouTubeEmbed.tsx:38-51` — same pattern for youtube (letter "Y" in the rare null case).
- `lib/fetchers/reddit.ts` delegates to the Atom parser; reddit `hot.rss` carries no `media:thumbnail`/enclosures → `thumbnailUrl` null for all reddit items.
- `lib/fetchers/x.ts` — tweet projection requests no media expansion → no thumbnail is ever produced.
- `lib/fetchers/huggingface.ts` — daily_papers entries expose no image field.
- `public/` listing: `banner.jpg`, `bg.jpg`, `favicon.*`, `huggingface.jpg`, `reddit.jpg`, `rss.jpg`, `x.jpg` — the four type images exist on disk and are referenced nowhere (`grep "/rss.jpg|/x.jpg|/reddit.jpg|/huggingface.jpg" app/ components/ lib/` → 0 matches in production code).

## Proposed Solution (GREEN)

Render-time fallback — no schema change, no Firestore backfill (backfilling asset paths into data freezes today's filenames into the database and forces a migration on every future image swap).

1. **`config/type-visuals.ts`** (new) — `TYPE_FALLBACK_IMAGE: Record<SourceType, string | null>`: rss→`/rss.jpg`, reddit→`/reddit.jpg`, x→`/x.jpg`, huggingface→`/huggingface.jpg`, youtube→`null` (real API thumbnails essentially always exist; the exhaustive Record forces an explicit decision when a new source type is added).
2. **`components/home/TypeFallbackImage.tsx`** (new, shared — Law 13) — renders the branded image with the same `aspect-video`/`object-cover`/hover treatment as real thumbnails; falls back to the existing letter tile only when the map value is null.
3. **`ContentCard` / `YouTubeEmbed`** — the null-thumbnail branches render `<TypeFallbackImage sourceType={…}/>` instead of the inline letter tiles. Behavior otherwise unchanged; real thumbnails untouched.

Alternatives considered: (a) DB backfill — rejected above; (b) inline per-component maps — rejected (two sources of truth, Law 13); (c) CSS background-image — rejected (no lazy loading, no alt semantics, harder to theme).

## Impact Analysis

- New: `config/type-visuals.ts`, `components/home/TypeFallbackImage.tsx`.
- Modified: `components/home/ContentCard.tsx`, `components/home/YouTubeEmbed.tsx` (fallback branches only).
- No schema/repo/fetcher changes; no data migration; home, type pages, and /search all inherit the change via `ContentGrid → ContentCard`.
- Blast radius: visual only. The letter branch remains reachable (youtube null case, future types).

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check`, `npm run lint`, `npm run build` — all must pass clean.
- Method 2 (dynamic): served pages on the operator's dev server contain `src="/reddit.jpg"`, `src="/huggingface.jpg"`, `src="/rss.jpg"` on thumbnail-less cards; assets serve 200.
- Call-graph reachability: `grep -rn "TypeFallbackImage" components/` → imported + rendered in both card components; `grep -rn "TYPE_FALLBACK_IMAGE" config/ components/` → definition + consumer.

## Discovered during analysis (recorded, not dropped)

- [OPEN-OUT-OF-SCOPE] Pre-existing: a stale/broken remote `thumbnailUrl` renders the browser broken-image UI (no `onError` fallback). Unrelated to this batch; future FID candidate.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Operator approved fallback-when-null + confirmed huggingface.jpg added. Design converged. |
| 2 | IMPLEMENT + AUDIT | — | Implemented; static gates + dynamic probes below. Reachability grep: `TypeFallbackImage` at ContentCard.tsx:5,40 and YouTubeEmbed.tsx:15,49; `TYPE_FALLBACK_IMAGE` at type-visuals.ts:12 → TypeFallbackImage.tsx:18. |

## Closure

Implementation evidence (file:line):
- `config/type-visuals.ts:12-18` — exhaustive `TYPE_FALLBACK_IMAGE` map (youtube null; rss/reddit/x/huggingface wired).
- `components/home/TypeFallbackImage.tsx:17-41` — shared fallback component (branded image; letter tile only when null).
- `components/home/ContentCard.tsx:5,40` and `components/home/YouTubeEmbed.tsx:15,49` — both null-thumbnail branches render `TypeFallbackImage`.

Gate results:
- Method 1 (static): `npm run type-check` PASS, `npm run lint` PASS, `npm run build` PASS (Next 16.2.6, 25 routes, zero warnings).
- Method 2 (dynamic, operator dev server on :3000): all four assets serve HTTP 200 (`/rss.jpg`, `/x.jpg`, `/reddit.jpg`, `/huggingface.jpg`). `/rss` (20 items, none carrying real thumbnails): 20/20 cards render `src="/rss.jpg"`; 40 in-site `/article/` links (no-exit intact).
- `/reddit` and `/huggingface` serve honest empty states (2 hits of "content yet") — no items of those types exist in Firestore yet; the fetch cycle remains blocked on the Firestore free-tier quota reset recorded in the 2026-09-04 session summary. Wiring is type-shared and proven live via /rss; the empty pages are a data state, not a code path.

Full `closed`/archive status remains gated on `git init` (G2 commit-hash closure) — recorded as an open out-of-scope operator decision. This FID is `verified` per the convention of FIDs 001–022.
