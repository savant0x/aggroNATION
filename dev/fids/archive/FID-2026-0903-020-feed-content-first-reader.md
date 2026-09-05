> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-020 — Feed-Content-First Reader (arXiv Rendering Defect)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-020-feed-content-first-reader.md` |
| **ID**       | FID-2026-0903-020 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator bug report (`/article/rss_oai_arXiv_org_2609_02649v1` renders boilerplate) |

## Summary

The article reader for an arXiv item rendered arXiv's **footer boilerplate** ("arXivLabs is a framework…") instead of the paper's abstract. Diagnosis: feed parsing is correct (title/authors/tags/abstract-prefix all stored) — the defect is downstream. (1) The feed's full content (`<description>` carries the whole abstract) is truncated to a 280-char preview at fetch time and the full text is discarded. (2) The reader then scrapes the source page, where arXiv's abstract lives in a `blockquote.abstract` my region patterns don't target, so extraction returns page chrome — and the "sufficient text" heuristic (≥200 chars) passes on boilerplate, rendering garbage as if it were the article.

## Evidence (RED)

- Stored doc `rss_oai_arXiv_org_2609_02649v1`: excerpt = abstract but cut at 280 chars; full content never persisted.
- Raw feed XML (rss.arxiv.org/rss/cs.AI): `<description>` contains the complete abstract.
- Rendered reader HTML: 4 paragraphs, all arXivLabs footer text; zero abstract.
- `lib/fetchers/article.ts`: patterns target article/main/div[role=main]/known-class-names — arXiv's `blockquote.abstract` is missed → body fallback → boilerplate.

## Proposed Solution (GREEN)

1. **Store full feed content** — rss fetcher captures the item's full HTML body (`content:encoded`/description), sanitized once at fetch time (sanitize-html, same allowlist as the reader), plus full plain text. New optional `contentHtml` field on the content schema and upsert path (backward compatible: old docs lack it; deterministic-id re-fetch backfills).
2. **arXiv shim** — strip the `arXiv:IDvN Announce Type: X` prefix boilerplate from description text before excerpting (documented publisher quirk, contained in the rss fetcher).
3. **Content-first reader** — render order: (a) stored `contentHtml` (re-sanitized at render — defense in depth; no remote fetch, instant) → (b) live scrape with improved extraction (adds `blockquote.abstract`-style patterns) → (c) excerpt + honest note. The "sufficient" heuristic stops trusting chrome: stored feed content is by definition the article.
4. **Backfill** — "Fetch all now" re-fetches with deterministic ids and fills `contentHtml` on existing rss docs.

Alternatives: (a) only fix the scraper patterns — every quirky site needs its own patch forever; the feed already carries what the publisher wants syndicated; (b) third-party readability service — right scaling move later, not needed to fix correctness now.

## Impact Analysis

- Modified: `lib/fetchers/rss.ts` (+full-content capture, +arXiv shim), `lib/schemas/content.ts` (+optional `contentHtml`), `lib/repositories/content-repo.ts` (+persist field), `app/article/[itemId]/page.tsx` (content-first order), `lib/fetchers/article.ts` (+abstract-pattern extraction).
- Blast radius: rss pipeline + reader only. Old docs render via scrape until backfilled.
- Security: stored HTML is sanitized at fetch AND re-sanitized at render.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build.
- Method 2 (dynamic): re-fetch the cs.AI feed via the admin API → docs gain `contentHtml` containing the full abstract; reader for the reported doc renders the abstract (grep a distinctive abstract phrase) with zero boilerplate and zero outbound anchors; a doc without stored content still falls back honestly.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) sanitize at fetch-time so the DB never holds raw third-party HTML; (2) `contentHtml` needs a size cap (500k) — some feeds embed entire pages; (3) the 200-char "sufficient" heuristic stays for the scrape path only, and blockquote.abstract patterns reduce chrome false-positives. Converged. |

## Closure

**Status: VERIFIED 2026-09-03 — live against the operator's dev server and real feeds.**

- Reader for the reported doc (`rss_oai_arXiv_org_2609_02649v1`) now renders the paper's actual abstract ("Aggregating noisy, conflicting textual hypotheses…") with **zero** arXivLabs boilerplate (before: 4 paragraphs of footer chrome, 0 abstract).
- Backfill executed through the real pipeline (22 sources, 1017 items, 21/22 ok): **100 of 150 rss docs now carry feed-provided `contentHtml`**; the other 50 are link-only items that honestly store none (reader falls back to scrape → excerpt note).
- The reported doc renders via the feed path ("Rendered from the publisher's own feed content" marker present); no-exit audit on the fixed reader: single outbound anchor = navbar GitHub icon (deliberate, documented).
- Pipeline bonus: the operator's mis-typed "Google AI Blog" source now fails with the precise FID-017 message instead of a confusing channel-resolution error — the trap-fix catching a real case.
- Static: type-check, lint, build clean.

Requires (outstanding): operator visual pass on the reported article.