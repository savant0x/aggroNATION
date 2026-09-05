> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-017 — Source Type/URL Edit + Escape Hatch for Wrong-Type Sources

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-017-source-edit-escape.md` |
| **ID**       | FID-2026-0903-017 |
| **Severity** | critical |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator bug report (wrong-type source traps the operator in a loop) |

## Summary

Operator workflow: added an RSS feed with "youtube" accidentally selected → create succeeded (creation doesn't validate that the URL matches the type) → every fetch fails ("Could not resolve channel id…") → editing the source and changing the type reports success but **silently changes nothing** → retry loop → archiving doesn't remove it and **archived rows have no delete control at all** → operator is fully stuck. Four defects compound:

1. PATCH schema (`app/api/admin/sources/[id]/route.ts`) permits only `name/enabled/config` — Zod silently **strips `type` and `url`**, so an edit that changes them is a no-op that returns 200.
2. `SourcePatch` (source-repo) has no `type`/`url` fields either — the repo layer cannot apply them even if the route forwarded them.
3. `SourceTable` renders **Restore-only** for archived rows — once archived, a source can never be deleted.
4. No hard delete exists anywhere (route, repo, or UI) — archive is the terminal state, so a garbage source lives forever in the table.

## Evidence (RED)

- Operator: "if you select the wrong item such as 'youtube' then input an rss feed… when i try to update the type, it gets locked… im in a loop, i cannot delete it, and updating it does not work."
- PATCH schema: `z.object({ name…, enabled…, config… })` — no `type`, no `url`.
- `SourcePatch` interface: `name/enabled/archived/config` only.
- `SourceTable.tsx` L135–158: `source.archived ? <Restore> : <Delete>` — mutually exclusive.
- Route docstring: "Hard delete is deliberately not offered" — a FID-005 design call the operator has now overridden by needing it.

## Proposed Solution (GREEN)

1. **PATCH accepts type + url** — route schema adds `type: sourceTypeSchema.optional()` and `url: z.string().url().optional()`. Repo: `SourcePatch` gains both; `updateSource` already set-merges top-level scalars. After a PATCH that changed `type` or `url`, the route re-runs `runFetchForSource(updated)` (awaited) and returns the outcome as data — fixing the type immediately proves itself (feed filled or honest error), no cron wait.
2. **Hard delete** — `hardDeleteSource(id)` in source-repo (doc delete) and `deleteContentBySource(sourceId)` in content-repo (batched writes ≤500/batch, returns deleted count). `DELETE /api/admin/sources/[id]?hard=true`: deletes the source AND all content items it produced. Available on any source; the confirm dialog makes the blast radius explicit.
3. **UI** —
   - `SourceFormModal`: type select stays editable on edit; PATCH body includes `type` and `url` on every save.
   - `SourceTable`: archived rows show **both** Restore and Delete.
   - `DeleteSourceDialog`: non-archived → existing soft-archive wording; archived (or explicit hard path) → "Permanently delete" with wording that the source **and all its content items** will be removed. Route: `?hard=true` wired from the dialog.
4. **Fetch-loop guard (defense in depth)** — youtube branch of `fetchSourceContent` fails fast with a specific message when the stored URL isn't a YouTube URL (currently the generic channel-resolution error), so a wrong-type source reports exactly what's wrong.

Alternatives: (a) validate URL-vs-type at create and reject — good UX but doesn't repair existing wrong-type sources, and rejecting mixed workloads (e.g. RSS URLs later served by an RSS fetcher) would be premature; both are done — a soft warning isn't needed once edit works; (b) type change without re-fetch — leaves the operator staring at the old failure state; (c) hard delete without content cleanup — orphans content docs whose `sourceId` points at nothing (exactly what the FID-016 verify cleanup had to fix manually).

## Impact Analysis

- Modified: `app/api/admin/sources/[id]/route.ts` (schema + refetch + hard delete), `lib/repositories/source-repo.ts` (+`hardDeleteSource`, patch fields), `lib/repositories/content-repo.ts` (+`deleteContentBySource`), `lib/services/fetch-service.ts` (clear wrong-type error), `components/admin/SourceFormModal.tsx`, `components/admin/SourceTable.tsx`, `components/admin/DeleteSourceDialog.tsx`, `components/admin/AdminDashboard.tsx` (hard-delete handler).
- Blast radius: admin surface only; public pages untouched. Content deletion is scoped to `sourceId == deleted source`.
- Safety: hard delete requires admin session (route-gated), explicit query flag, and an explicit confirm dialog naming the destructive outcome.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean.
- Method 2 (dynamic, real Firebase + dev server — extend `scripts/fid016-bulk-verify.ts` pattern): create a source with a deliberately wrong URL → PATCH type/url to a real channel → 200 with fetch outcome itemsFetched > 0 and the source doc reflecting the new values in Firestore; hard delete → 200, source gone from Firestore AND its content docs gone (count before/after); anon PATCH/DELETE → 401; archived row still lists Delete (markup probe); cleanup of everything seeded.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) set-merge replaces a provided nested `config` map wholesale — the modal always sends the full config, so behavior is unchanged; (2) hard-delete content cleanup must batch (Firestore 500-write limit); (3) re-fetch on type/url change must use the UPDATED source object, not the pre-patch one. Converged. |

## Closure

**Status: VERIFIED 2026-09-03 — 17/17 dynamic checks PASS** (scripts/fid017-edit-delete-verify.ts against real Firebase Auth + Firestore and a dev server). The operator's exact scenario was reproduced end-to-end:

- Trap: youtube-typed source with an RSS URL created (201); immediate fetch fails with the new precise error ("…is not a YouTube URL — edit the source and correct its type or URL").
- Repair via edit: PATCH `{type: "rss"}` → 200 and **the Firestore doc actually changed** (type=rss, interval=30) — this was the silent no-op before; refetch outcome returned as data (`Fetcher for "rss" is not implemented yet`).
- Full repair: PATCH `{type: "youtube", url: <real channel>}` → refetched=true, **5 real items fetched**, source doc reflects both new values.
- No-op guard: name-only PATCH → `refetched: false` (no wasted quota cycle).
- Hard delete: `DELETE ?hard=true` → 200 with `contentDeleted: 5`; source doc gone; content count before=5 → after=0.
- Soft delete unchanged: default DELETE → archived=true, doc retained (restorable).
- Boundaries: anon PATCH → 401; anon DELETE → 401.
- Static: type-check, lint, build clean.
- UI: archived rows now render Restore **and** Delete; archived delete dialog's primary action is permanent delete with content-loss warning; live-source dialog offers Archive + explicit Delete permanently; failed immediate-fetch after save keeps the modal open with the error inline (retryable in place).

Requires (outstanding): operator visual confirmation that the loop is escapable from their stuck state — if a source is already archived-stuck, Restore or Delete permanently now both appear on its row.