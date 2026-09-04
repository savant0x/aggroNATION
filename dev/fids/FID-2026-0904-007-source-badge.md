# FID-2026-0904-007

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-007-source-badge.md` |
| **ID**       | 2026-0904-007 |
| **Severity** | minor |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 18–22 (per ECHO attribution rules, no agent names) |

## Summary

Operator approved the follow-up to FID-2026-0904-006: home sections are now sourcediversified, but nothing *shows* which feed each card came from — the fairness is invisible. Cards should carry a small source badge. Design decision: rather than resolving names at render time (39 source-doc reads per home render, every render, forever — hostile to the free tier), denormalize `sourceName` onto content docs at fetch time and backfill existing docs once. Content docs become self-describing, benefiting every current and future surface at zero per-render read cost.

## Evidence (RED)

- `components/home/ContentCard.tsx` / `YouTubeEmbed.tsx` — meta row shows `author · date` only; no source identity. `item.sourceId` exists but is an opaque Firestore id.
- `lib/schemas/content.ts` contentSchema — no sourceName field.
- `app/page.tsx` renders diversified sections (FID-006) whose fairness is unverifiable by eye.
- Render-time resolution alternative measured: `getAllSources()` = 39 doc reads per home render (force-dynamic) — rejected.

## Proposed Solution (GREEN)

1. **Schema** — `contentSchema` gains `sourceName: z.string().min(1).max(120).nullable().default(null)` (nullable: pre-backfill docs).
2. **Repo** — `UpsertContentInput` gains optional `sourceName`; upsert persists it.
3. **Fetch-service** — all 5 type branches pass `sourceName: source.name` (single line each; the name is already in scope).
4. **Backfill** — one-off `scripts/backfill-source-names.ts`: build sourceId→name map (39 sources), stream all content docs, batch-write `sourceName` (450/batch, under the 500-op limit) where missing. Idempotent; verify pass fails if any doc still lacks a name.
5. **UI** — shared `SourceBadge` component: pill overlaid top-left of the thumbnail (`bg-black/60 backdrop-blur`, 10px uppercase tracking-wide), `max-w` + truncate, aria-hidden text duplication avoided (the name is also in the card's accessible flow via author line? No — render as visible text; links keep their aria-labels). Rendered in both ContentCard and YouTubeEmbed thumbnail areas; hidden when sourceName is null.

Alternatives: render-time resolution (39 reads/render forever — rejected); deriving from externalId (not reliable across types — rejected); CSS-only via doc id (opaque, ugly — rejected).

## Impact Analysis

- Modified: `lib/schemas/content.ts`, `lib/repositories/content-repo.ts` (input type + upsert), `lib/services/fetch-service.ts` (5 lines), `components/home/ContentCard.tsx`, `components/home/YouTubeEmbed.tsx`; new `components/home/SourceBadge.tsx`, `scripts/backfill-source-names.ts` (one-off, kept as migration record).
- Data: ~1,100 content docs get one `sourceName` write each (free-tier batched, one-off).
- Blast radius: additive field; cards without a name simply omit the badge; no queries change; no index changes.

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build.
- Method 2 (dynamic): backfill verify pass (0 docs missing); served home HTML contains badge text for known sources ("Hacker News", "Open Source Projects", "Trendshift"); huggingface page shows "HuggingFace Daily Papers".
- Reachability: grep `SourceBadge` → both card components; grep `sourceName` → schema, repo, fetch-service branches.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Direct follow-up to FID-006; denormalization chosen over render-time resolution on read-cost evidence. |

## Closure

Implementation evidence:
- Schema: `sourceName: z.string().min(1).max(120).nullable().default(null)` on contentSchema (lib/schemas/content.ts).
- Repo: `UpsertContentInput.sourceName?` + validate + persist (content-repo.ts, merge-safe like contentHtml).
- Fetch-service: all 5 branches pass `sourceName: source.name`.
- New `components/home/SourceBadge.tsx` (null-safe, title attr, truncating); wired into ContentCard (overlay branch + fallback via TypeFallbackImage `withBadge`), TypeFallbackImage (both branches, letter tile stays behind the badge), YouTubeEmbed (single badge on the link container — no double render).
- Backfill `scripts/backfill-source-names.ts`: scanned 1256, backfilled 1256, orphans 0, VERIFY PASS (free-tier batched 450/commit).
- Gates: type-check PASS, lint PASS, build PASS.
- Dynamic (operator's dev server :3000): home carries 137 badge nodes; visible names include Trendshift, OpenAI, r/AI_Agents, r/singularity, arXiv cs.AI, OpenAI News — the FID-006 diversification is now visually verifiable; /huggingface shows 20 badged cards (40 payload refs).
