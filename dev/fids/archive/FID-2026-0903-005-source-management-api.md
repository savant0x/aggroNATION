> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-005 — Source Management API (Admin CRUD)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-005-source-management-api.md` |
| **ID**       | FID-2026-0903-005 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md Amendment 1 (operator-confirmed full-system build) |

## Summary

Sources (YouTube channels, later RSS/Reddit/X) cannot be registered, edited, or disabled by any code path — the pipeline (FID-003) would have nothing to iterate. This FID adds the admin-only CRUD API. Admin UI is explicitly deferred (SCOPE.md); this FID delivers the API surface only, consumable via curl/REST client until the dashboard FID lands.

## Evidence (RED)

- `grep -r "sources" app/api/` → no routes exist (fresh build has only scaffold routes; `/api/health`, `/api/cron/fetch`, `/api/auth/*` arrive via FID-001/003/004).
- `firestore.rules` deny all client writes to `sources` — management must go through an admin-authenticated server route.
- `source-repo` (FID-002) has no caller: zero production reachability today.

## Proposed Solution (GREEN)

**`app/api/admin/sources/route.ts`** (admin-gated via FID-004 `requireAdmin`):

- `GET` — list all sources (no pagination need at current scale; cap 200 documented).
- `POST` — create source. Zod body: `{ type, name, url (https, unique — `getSourceByUrl` pre-check + rule-of-thumb uniqueness at write time), enabled?, config? }` with defaults from schema (`fetchIntervalMinutes: 60`, `priority: medium`, `maxItems: 50`). Duplicate URL → `409`.
- `PATCH /app/api/admin/sources/[id]/route.ts` — partial update; `enabled` toggles allow killing a misbehaving source without deletion.
- `DELETE /app/api/admin/sources/[id]/route.ts` — soft-delete (sets `enabled: false` + `archived: true`) — preserves historical content linkage; hard delete explicitly NOT offered to avoid orphaning `content` docs.

Alternatives: (a) server actions instead of route handlers — rejected for this FID, external schedulers/curl need real HTTP for ops tooling; UI later may use server actions reusing the same repo functions (Law 13: repo is the shared truth, routes/actions are thin shells); (b) hard delete — rejected above.

## Impact Analysis

- Files created: `app/api/admin/sources/route.ts`, `app/api/admin/sources/[id]/route.ts`.
- Depends on: FID-002 (source-repo), FID-004 (requireAdmin).
- Error contract: 401 unauthenticated, 403 authenticated-but-not-admin, 404 unknown id, 409 duplicate URL, 422 Zod issues array. All error bodies `{ error, details? }` — no stack traces, no env leakage.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + build clean.
- Method 2 (dynamic): emulator-mode — unauthenticated GET → 401; admin session → full CRUD happy path; duplicate POST → 409; invalid body → 422 with issues.
- Call-graph reachability: `grep -r "source-repo" app/api/` matches both routes; this closes the FID-002 interim-reachability note for sources.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) DELETE originally hard-deleted → orphaned content docs, changed to soft-delete; (2) missing 403-vs-401 distinction → added (admin claim check distinct from auth check); (3) duplicate-URL check was fetch-then-write → documented 409 contract. Converged. |

## Closure

Requires: implementation commit + emulator-mode CRUD evidence + grep proof of source-repo usage.

## Implementation Evidence (2026-09-03)

- Static: type-check/lint/build clean; `/api/admin/sources` + `/api/admin/sources/[id]` registered (ƒ).
- Schema amendment: `archived` flag added to source schema (soft-delete owner field), create path writes it.
- Boundary verification (live): unauthenticated `GET` → 401 `{Authentication required}`; junk `POST` without session → 401 before validation (auth precedes parsing by design).
- Reachability: `grep source-repo app/api/` matches both routes — closes FID-002's interim-reachability note for sources.
- ~~BLOCKED (CRUD happy path)~~ RESOLVED (2026-09-03): unblocked together with FID-004 — operator activated Auth, ADC wired, Firestore provisioned.
- **Full CRUD happy path PASS (2026-09-03, same 14/14 run as FID-004)**: authenticated admin `POST /api/admin/sources` → 201 (real Firestore doc); duplicate URL → 409; Zod-invalid body → 422; PATCH → 200 with change applied; DELETE → soft delete (`archived: true`) — content linkage preserved. Non-admin create attempt → 403. Unauth boundary → 401.
- Status `verified` (boundaries + wiring + full CRUD happy path).