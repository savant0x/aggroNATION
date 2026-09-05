# FID-2026-0904-020

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-020-dev-fids-audit-and-archive-pass.md` |
| **ID**       | FID-2026-0904-020 |
| **Severity** | major |
| **Status**   | converged |
| **Created**  | 2026-09-05 |
| **Author**   | Operator direction: "we need to audit this fid folder, it also looks like we're violating echo and missing multiple files" |

## Summary

`dev/fids/` ECHO-compliance audit surfaced four closed FIDs that violated
the auto-archive contract (closed status but still resident in
`dev/fids/`; no `dev/fids/archive/` directory existed at all). This FID
records the audit, authorizes the move of FIDs 009, 010, 011, 016 into
the newly-created `dev/fids/archive/`, and seeds `CHANGELOG.md` with the
archive entry. The 0903-series FIDs (001–022, all `verified` or
`converged`) reference a Firebase architecture replaced by
`FID-2026-0904-010`; they remain in `dev/fids/` pending the
`FID-2026-0904-021` supersession-cleanup follow-up.

## Evidence (RED)

- `ls dev/fids/archive/` → no such directory (the ECHO-mandated archive
  location has never been created on disk).
- 4 FIDs in `dev/fids/` carry `Status: closed` in their metadata:
  009, 010, 011, 016. ECHO's "FID Auto-Archive" section states
  explicitly: "When a FID status is updated to **Closed**, you MUST …
  Move the FID file from `dev/fids/` to `dev/fids/archive/` … Closed
  FIDs must not remain in the active `dev/fids/` directory." All 4 are
  in violation.
- `CHANGELOG.md` does not exist at the repo root. The auto-archive
  contract requires appending a CHANGELOG entry alongside the move.
- 22 FIDs in the 0903-series (`FID-2026-0903-001` through
  `FID-2026-0903-022`) reference `lib/firebase/*` code paths. The
  directory does not exist in the tree — the architecture was
  replaced by `FID-2026-0904-010` (Supabase migration). Their
  `Status: verified` / `Status: converged` metadata is ground-truth
  false (FID Ground-Truth Verification rule). Treated as a separate
  follow-up (`FID-2026-0904-021`) because the 22 files exceed this
  FID's per-pass scope and need their own status-update pass.
- 7 FIDs in the 0904-series have metadata `**ID**` fields missing the
  `FID-` prefix (001–007) and 5 have `converged` status while the
  implementation is already in the tree (012, 013, 014, 015, 017).
  Both are also `FID-2026-0904-021` scope.

## Proposed Solution (GREEN)

- Create `dev/fids/archive/` (empty directory; tracks via `.gitkeep`
  or just the first committed file).
- `git mv` the 4 closed FIDs (009, 010, 011, 016) into
  `dev/fids/archive/`. Use `git mv` (not `mv` + `git add`) so git
  records the rename for `git log --follow`.
- Create `CHANGELOG.md` at the repo root with a `2026-09-05` section
  documenting the archive move and pointing to the 4 FID IDs.
- Single atomic commit per G3 (one coherent ledger-hygiene change,
  not four). Per G4, path-scoped staging:
  - `CHANGELOG.md` (new file)
  - `dev/fids/archive/` (new dir)
  - 4 `dev/fids/archive/FID-…-…md` (renames from `dev/fids/`)
- The operator (G1) executes the commit; the commit message
  references this FID per G8:
  `docs(fids): archive closed FIDs 009, 010, 011, 016 per auto-archive contract (FID-2026-0904-020)`

## Impact Analysis

- New files: `CHANGELOG.md`, `dev/fids/archive/` directory entry.
- Renamed files (4): `dev/fids/FID-2026-0904-{009,010,011,016}-…md`
  → `dev/fids/archive/FID-2026-0904-{009,010,011,016}-…md`.
- No code change, no schema change, no new deps.
- No runtime behavior change. The 4 FIDs are documentation only;
  their production code shipped in earlier commits and is already in
  the production build.

## Verification Plan (AUDIT)

- **Method 1 (static):** `npm run lint` (exit 0 — already verified
  inline for the CHANGELOG.md add). No code touched, so
  `npm run type-check` would not surface anything new but is a
  free signal.
- **Method 2 (filesystem, post-move):**
  - `ls dev/fids/` — must NOT contain the 4 moved FIDs.
  - `ls dev/fids/archive/` — must contain exactly the 4 moved FIDs.
  - `cat dev/fids/archive/FID-2026-0904-010-supabase-migration.md |
    head -10` — `**Status**` still reads `closed` (no metadata
    rewrite was needed; only the location changed).
  - `cat CHANGELOG.md` — `2026-09-05` section present with all 4
    FID IDs.
- **Git evidence (post-commit):**
  - `git log --name-status -1 HEAD` — should show the 4 files as
    `R` (rename) entries, not `D` + `A` (delete + add). This
    preserves `git log --follow` history.
  - `git log --grep="FID-2026-0904-020" --oneline` — must return the
    new commit.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | 0% | Convergence — this is a ledger-hygiene FID; the design space is the ECHO auto-archive contract, not a novel implementation. |

## Out of Scope (Tracked Separately)

- 0903-series supersession (FIDs 001–022 referencing dead Firebase
  code): `FID-2026-0904-021` (to be authored after this commit lands;
  backfill of `Status: archived-superseded` metadata on 22 files).
- 0904-series metadata corrections (001–007 `**ID**` field missing
  `FID-` prefix; 012, 013, 014, 015, 017 flipping `converged` →
  `closed`): bundled with `FID-2026-0904-021`.

## Closure

`converged`. Will be flipped to `closed` after:

1. The operator commits the move (per the staging plan above) and
   pastes the commit SHA.
2. The post-move filesystem probe (Method 2) returns the expected
   4-in-archive / 0-in-active layout.
3. `git log --follow` confirms the renames were recorded as renames,
   not deletes + adds.