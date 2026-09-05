# FID-009 — Admin Dashboard (Source Management UI)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-009-admin-dashboard.md` |
| **ID**       | FID-2026-0903-009 |
| **Severity** | critical |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator directive (silent deferrals revoked; completion ordered) |

## Summary

FID-004/005 shipped the auth + CRUD *API* (login page, session exchange, `/api/admin/sources` GET/POST, `[id]` PATCH/DELETE with 401/403/404/409/422 contracts) but no UI consumes them — the "Admin dashboard UI" SCOPE item was silently deferred. Source management currently requires raw curl with bearer session cookies. This FID completes the approved item: a protected `/admin` dashboard for source CRUD + a manual fetch trigger.

## Evidence (RED)

- `grep -r "api/admin/sources" app/ components/` → zero UI callers (API verified live in FID-005 but unreachable without curl).
- `app/(auth)/login/page.tsx` exists and pushes to `/` after sign-in — no admin destination exists.
- `firestore.rules`: `sources` readable/writable only by `request.auth.token.admin == true` — UI must be server-gated, not just client-hidden.
- SCOPE.md: "[DEFERRED] Admin dashboard UI — after auth + pipeline are wired" — deferral revoked by operator.

## Proposed Solution (GREEN)

1. **Server gate** — `app/admin/page.tsx` (server component) calls `getCurrentUser()` (FID-004, `lib/auth/session.ts`): null → `redirect("/login")`; non-admin → honest "not an admin" state (no data leaked). Admin → fetch `getAllSources()` directly through the repository (server component reads repo, not its own HTTP API — the anti-pattern FID-003 killed) and render the dashboard shell.
2. **`components/admin/SourceTable.tsx`** (client) — slot-composed `Table` (verified exports: `Table.Content` → `Table.Header`/`Table.Column` + `Table.Body`/`Table.Row`/`Table.Cell` from `@heroui/react@3.2.4` d.ts): columns Name, Type, URL, Interval, Items, Status (enabled/archived), Last fetch, Errors, Actions. Error rows highlighted from `metadata.lastError`.
3. **`components/admin/SourceFormModal.tsx`** (client) — create + edit via `ModalRoot state={useOverlayState()}` (verified hook contract). Fields: name, url, type (Select: youtube/rss/reddit/x), interval minutes (5–1440), maxItems (1–200), priority. Zod validation client-side mirrors the route's `createSourceSchema`; POST → 201 closes + `router.refresh()`; 409/422 surfaced inline; edit mode PATCHes `{id}`.
4. **Delete** — `AlertDialog` slot composition (verified exports) with type-to-confirm none (soft delete is reversible via PATCH `archived:false`); DELETE → refresh.
5. **Enable/disable toggle** — `Switch` (verified export) per row → PATCH `{enabled}`; archived rows show Restore action (PATCH `{archived:false, enabled:true}`).
6. **Manual fetch trigger** — POST `/api/admin/fetch` (new route): `requireAdmin()` → `runFetchAllSources()` → returns outcomes summary (200) — `force-dynamic`, `maxDuration 60`. Button with per-run result flash (success count / failures). This closes the operator's "fetch now" gap without waiting for cron.
7. **Nav wiring** — `siteConfig.navItems` gains `Admin` only when… nav is static config; instead `components/navbar.tsx` gets a conditional admin link rendered client-side via `/api/auth/me` (exists, FID-004) — `isAdmin` → show Admin link; server page still the real gate.

Alternatives considered: (a) Firestore client SDK writes from the dashboard — rejected: rules allow admin writes but schema validation lives in the repo layer; bypassing it invites unvalidated docs; (b) react-admin/Amplication — rejected: heavyweight dependency for one table + one form; (c) separate `/admin/sources` route — rejected: one page until scope demands more (YAGNI, still one gate).

## Impact Analysis

- New: `app/admin/page.tsx`, `app/api/admin/fetch/route.ts`, `components/admin/SourceTable.tsx`, `components/admin/SourceFormModal.tsx`, `components/admin/DeleteSourceDialog.tsx` (shared modal state lives in page-level client wrapper `components/admin/AdminDashboard.tsx` so table + modals coordinate without prop drilling through the server component).
- Modified: `components/navbar.tsx` (conditional Admin link), `config/site.ts` (admin path constant), `app/(auth)/login/page.tsx` (post-login redirect: admins → `/admin`, others → `/`).
- No schema/index changes (list = full collection scan, admin-only, trivial volume).
- Blast radius: new routes behind existing gates; zero changes to public pages.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; zero `any` (Law 6).
- Method 2 (dynamic, boundaries): unauthenticated `/admin` → redirect to `/login`; non-admin session → no-data state; direct `/api/admin/fetch` without cookie → 401. Live happy path: sign in as promoted admin → create source (201 → row appears) → toggle enabled (PATCH 200) → trigger fetch (real pipeline run) → soft-delete → restore. Evidence via script output pasted into FID.
- Call-graph reachability: `grep -r "AdminDashboard" app/` matches the page; `grep -r "api/admin/fetch" components/` matches the trigger button; `grep -r "getAllSources" app/admin/` matches the server-side data path.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) reading `/api/admin/sources` from the server page would be the self-call anti-pattern → repo read directly; (2) static nav config can't know roles → conditional client link via existing `/api/auth/me`, server page remains the real gate (rules enforce claim regardless); (3) modal family needs coordinated state across table/form/delete → single client wrapper owns `useOverlayState` instances, server component stays pure. Converged. |

## Closure

Requires: implementation evidence (file:line), boundary + happy-path verification output, grep reachability matches, static gates output.

## Implementation Evidence (2026-09-03)

- Files: `app/admin/page.tsx` (server gate: `getCurrentUser` → redirect /login; honest non-admin state; repo-direct `getAllSources()`), `components/admin/AdminDashboard.tsx` (client wrapper owning overlay state), `SourceTable.tsx` (slot-composed Table + Switch), `SourceFormModal.tsx` (create/edit modal, keyed form, zod-mirrored validation), `DeleteSourceDialog.tsx` (soft-delete confirm), `AdminNavLink.tsx` (conditional nav link via /api/auth/me), `app/api/admin/fetch/route.ts` (requireAdmin → runFetchAllSources). Modified: `navbar.tsx`, `site.ts`, `login/page.tsx` (admin post-login → /admin).
- API deviations documented: `AlertDialog` is trigger-composed (no `state` prop) → state-controlled `Modal` used; `Select` requires full slot composition → native `<select>` styled to tokens; `Table.removeWrapper` does not exist in v3.2.4.
- Static: type-check + lint + build clean; build route table shows ƒ /admin, ƒ /api/admin/fetch.
- Dynamic: `scripts/admin-dashboard-verify.ts` vs real Auth+Firestore — **12/12 PASS**: anon /admin → 307 /login; anon POST /api/admin/fetch → 401; non-admin page renders "Admin access required" with no source data; admin page renders "Source management" + seeded rows; manual fetch → real pipeline cycle (3 sources incl. operator's live source) with rss isolation verified; PATCH/restore/soft-delete 200.
- Reachability: AdminDashboard imported in app/admin/page.tsx:6,71; /api/admin/fetch called from AdminDashboard.tsx:118; getAllSources in page.tsx:5,20.
- Status `verified`.
