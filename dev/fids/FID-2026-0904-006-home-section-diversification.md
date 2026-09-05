# FID-2026-0904-006

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-006-home-section-diversification.md` |
| **ID**       | FID-2026-0904-006 |
| **Severity** | minor |
| **Status**   | verified |
| **Created**  | 2026-09-04 |
| **Author**   | SCOPE.md Amendments 18–21 (per ECHO attribution rules, no agent names) |

## Summary

Operator: "you also forgot https://www.opensourceprojects.dev/". Evidence: the source was never forgotten — registered 2026-09-04 in the same batch as Hacker News, enabled, 12 content docs fetched. The real defect is selection visibility: home sections take the freshest 15 items of a type, and minute-fresh feeds (Hacker News) plus arXiv push slower sources (OSP's newest item: Sep 3 morning) out of every home view and pages deep into /rss. A registered source that can never surface is a product defect, not operator error.

## Evidence (RED)

- Firestore probe (this session): source `Open Source Projects` (cymg51fxwoC1cS7M89XG), type=rss, enabled, 12 content docs.
- `lib/repositories/content-repo.ts:96-122` — `getLatestContent` orders strictly by `publishedAt desc`, limit 15. Home (`app/page.tsx`) renders that list directly.
- OSP feed cadence: items arrive ~daily (12 items, newest Sep 3 09:18 GMT); hnrss cadence: minutes.

## Proposed Solution (GREEN)

1. **`getLatestContentDiversified`** in `content-repo.ts` — one query (archived=false, type-scoped, `publishedAt desc`, overfetch 3×limit, floor 45), then in-memory selection: group candidates by `sourceId` (freshness order preserved within each), **round-robin one item per source per pass, max `perSourceCap` passes (default 3)**, then top-up from leftovers in freshness order when sources are too few to fill the section. Result: every source with recent items appears; no single feed can fill a section; ordering stays freshness-coherent.
2. **`app/page.tsx`** — home sections use the diversified selector (totals, Top rated, and type pages unchanged: /rss keeps pure chronological order).

Alternatives: per-source queries (fewer reads but 5+ queries per section and a source-list dependency — complexity without benefit at this scale); raising the section size (dilutes, doesn't fix); leaving it (operator-visible defect).

## Impact Analysis

- Modified: `lib/repositories/content-repo.ts` (+1 function), `app/page.tsx` (selector swap).
- Read cost: 45/section vs 15 — bounded, acceptable on the free tier for a force-dynamic page.
- Blast radius: home sections only; /rss, /search, admin untouched.

## Verification Plan (AUDIT)

- Method 1 (static): type-check, lint, build.
- Method 2 (dynamic): home RSS section contains items from ≥3 distinct sources INCLUDING Open Source Projects (probe of served HTML doc ids); a type with a single source (huggingface) renders unchanged.
- Reachability: grep `getLatestContentDiversified` → repo definition + home consumer.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Operator "forgot" report diagnosed as selection starvation; fix designed same pass. |

## Closure

Implementation evidence:
- `lib/repositories/content-repo.ts` — `getLatestContentDiversified` (v2): newest `perSourceCap` per source (bounded reads, ≤12 sources), round-robin to the cap, global-chronological top-up, freshness-sorted output; per-source query failures isolated (skip + log — proven live during index build: section still rendered full via the filler path).
- v1 (single overfetch query) was implemented, live-probed, and **rejected on evidence**: the 45-doc window never reached Sep 3 OSP items (HN+arXiv have ~200 fresher docs) — replaced by the per-source design with a new composite index (sourceId ASC + archived ASC + publishedAt DESC) in `firestore.indexes.json`, deployed live via firebase CLI (deploy OK; ~3.5 min build, polled to ready).
- `app/page.tsx` — home sections use the diversified selector (caps: 3 per source; /rss, /search unchanged).
- Gates: type-check PASS, lint PASS, build PASS.
- Dynamic probe (real Firestore): 15 items across 5 sources — HN 3, arXiv 3, OpenAI 3, HF Blog 3, **Open Source Projects 3** — freshness-sorted. Served home HTML contains opensourceprojects card links (21 refs incl. RSC payload).
- Read cost: ~15 doc reads/section (5 sources × 3) + top-up only when needed — cheaper than v1's 45.
