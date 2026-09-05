# FID-2026-0905-004

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0905-004-test-foundation.md` |
| **ID**       | FID-2026-0905-004 |
| **Severity** | major |
| **Status**   | closed |
| **Created**  | 2026-09-05 |
| **Trigger**  | Operator: "lets focus on the tests" — the highest-ranked debt from the system review |

## Summary

First automated test layer over the pure logic — the code that regresses silently and
is currently guarded only by manual probes. Framework: Node's built-in `node:test`
runner via tsx (already the project's TS executor) — **zero new runtime
dependencies**, one devDependency (`tsx`, promoted from npx-ghost to explicit).

## RED — evidence (probed 2026-09-05)

1. **Zero test files** in the repository; no `test` script in package.json; no test
   framework in devDependencies. Every verification so far was manual (gates + live
   probes) — rigorous, unrepeatable.
2. **Pure-logic inventory** (no I/O, no `server-only`, no DB imports — all directly
   importable from tests): `lib/fetchers/rating.ts` (62 lines, the ranking core),
   `lib/quality/scrubber.ts` (80, junk detection + htmlToPlainText), `lib/strings.ts`
   (52, surrogate-safe truncation — exists *because* of a production jsonb bug),
   `lib/format/relative-time.ts` (14), `lib/fetchers/trendshift.ts` canonicalize +
   parse surface (318 total, parser includes the robots-law `/api` refusal),
   `lib/fetchers/osp-impressions.ts` parseImpressions (101).
3. **Untestable-by-structure:** the momentum baseline decision (which patches apply
   when `ratingDayAgoAt`/`ratingWeekAgoAt` age past their windows) lives inside
   `refreshMomentumBaselines` in `content-repo.ts` — a `server-only` module with DB
   I/O. The decision logic is pure and belongs in its own module (Law 13).
4. Node v25 locally; `node:test` stable; tsx resolves TS + relative imports natively
   (tests use relative paths, so the `@/` alias is not exercised).

## GREEN — design

- **Extract** `lib/momentum.ts` (pure): `momentumPatches(metrics, nowMs)` returns the
  day/week baseline patch subset (empty object = nothing stale). `content-repo`'s
  refresher consumes it — I/O stays in the repo, decision becomes universal + tested.
- **Tests** (`tests/*.test.ts`, relative imports, `node:test` + `assert/strict`):
  1. `rating.test.ts` — engagement weighting (likes×2 + comments×3) / views, clamps,
     zero-views; freshness = 1 at publish, e⁻¹ at 14 days, future dates clamped;
     computeRating bounds + weight blend; NaN inputs → 0.
  2. `scrubber.test.ts` — htmlToPlainText (tags, entities, script/style, whitespace);
     detectJunk hits every pattern name + clean body → null + empty-body.
  3. `strings.test.ts` — stripLoneSurrogates (valid pair kept, lone halves dropped);
     truncateSafe (boundary back-off onto a surrogate pair, under-max no-op).
  4. `relative-time.test.ts` — vocabulary boundaries (59s→"59s ago", 60s→"1m ago",
     60m→"1h ago", 24h→"1d ago") + null → "never".
  5. `trendshift.test.ts` — canonicalize (default sort, sort preserved, non-host →
     null, **/api → null (robots law)**, malformed → null).
  6. `osp-impressions.test.ts` — parseImpressions (plain, comma, embedded in HTML
     with scripts, absent → null, garbage → null).
  7. `momentum.test.ts` — patches for fresh/stale/partially-stale/not-stale metrics.
- **Gate wiring:** `npm test` → `tsx --test tests/*.test.ts`; `tsx` added to
  devDependencies; README scripts table + CHANGELOG updated.

## AUDIT — verification plan

- `npm test` exit 0 with a meaningful assertion count (reported by the runner).
- Mutation spot-check (Double Audit, method 2): temporarily break one pure function
  (flip the engagement comment weight) → the relevant test MUST fail → revert →
  green. Proves the tests detect regressions, not just pass.
- Gates: type-check + lint + build still exit 0 (tests are type-checked too).
- Law 4: `momentumPatches` has exactly 2 callers (content-repo + its test).

## Closure evidence (2026-09-05)

- **Suite:** `npm test` → **55 tests / 11 suites / 0 failures** (~0.3s). Covers rating (weights, clamps, NaN),
  scrubber (all five junk patterns + entity/tag handling), surrogate-safe strings (the production jsonb bug's
  exact semantics), relative-time vocabulary boundaries, trendshift canonicalization (incl. the robots `/api`
  refusal and host-spoof refusals), OSP impressions parsing, and the momentum decision (fresh/stale/partial/
  malformed/non-finite).
- **Mutation spot-check (Double Audit, method 2):** comment weight `* 3 → * 4` (grep-verified in source) →
  suite reports **1 fail**; revert → 55/0 green. The first mutation attempt was a dud — the sed pattern didn't
  match the real line, so it was redone against grep-verified source rather than claimed as passed.
- **Two test-expectation bugs caught during authoring** (tests testing the tests): first-sight momentum seeds
  4 fields, not 2; adjacent high surrogates are BOTH lone and both dropped. Both fixed in the tests after
  reasoning from the implementation's documented semantics.
- **Gates:** type-check, lint, build all exit 0 with the new `tests/` directory and `lib/momentum.ts` extraction.
- **Structure:** the momentum decision now lives in pure `lib/momentum.ts`; content-repo only moves bytes
  (Law 13). Tests import via relative paths — no tsconfig alias dependency.
