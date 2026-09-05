> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-004 — Firebase Auth & Admin Gating

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-004-auth-admin.md` |
| **ID**       | FID-2026-0903-004 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md Amendment 1 (operator-confirmed full-system build) |

## Summary

Auth was scoped (email/password + Google, admin via custom claim) but has no implementation. Legacy build's session scheme was forgeable plain-base64 (critical finding of the 2026-09-03 review) — this FID replaces the concept entirely with Firebase session cookies, which are verifiable server-side and cannot be hand-crafted.

## Evidence (RED)

- `grep -r "signInWith\|createUser\|onAuthStateChanged" app/ lib/ components/` → zero matches.
- `firestore.rules` gates `sources` on `request.auth.token.admin == true` — no code path exists to grant that claim or to authenticate at all.
- No login/register pages exist (removed with template demo routes).

## Proposed Solution (GREEN)

1. **Client sign-in** (`app/(auth)/login/page.tsx`, client component): email/password + `signInWithPopup(google)`; errors surfaced inline (auth/invalid-credential, popup-blocked etc. mapped to human messages).
2. **Session cookie exchange** (`app/api/auth/session/route.ts`): client sends ID token → server verifies via `adminAuth.verifyIdToken` → `adminAuth.createSessionCookie(token, { expiresIn: 7d })` → httpOnly, secure, sameSite=lax `session` cookie. Cannot be forged without Firebase's signing keys (directly answers the legacy critical finding).
3. **Server-side gate** (`lib/auth/session.ts`): `getCurrentUser()` reads cookie → `adminAuth.verifySessionCookie` → returns `{ uid, email, isAdmin }`; `requireAdmin()` throws typed `AuthError('unauthorized')`.
4. **Admin bootstrap**: first-run path — operator promotes their own uid via CLI (`firebase auth:import` is overkill; instead `lib/auth/promote.ts` script run with admin credentials, sets claim + creates `/users/{uid}` doc). Claim checked in `session.ts`; rules already enforce it.
5. **Middleware note**: session verification happens in server components/routes (cookie → verifySessionCookie), NOT edge middleware — `firebase-admin` cannot run on the Edge runtime; documented to prevent future misuse.

Alternatives considered: (a) NextAuth — rejected, redundant layer over Firebase Auth we already run; (b) client-only admin gating — rejected, client checks are UX sugar, all real gating stays server-side + rules-enforced.

## Impact Analysis

- Files created: `app/(auth)/login/page.tsx`, `app/api/auth/session/route.ts`, `app/api/auth/logout/route.ts`, `lib/auth/session.ts`, `scripts/promote-admin.ts`.
- Depends on: FID-001.
- Firestore impact: `/users/{uid}` docs created on first promote/sign-in (rules already cover).
- No public-page impact — public content stays rule-world-readable.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + build clean.
- Method 2 (dynamic): emulator auth — sign in → session cookie set → `/api/auth/me` returns identity; tampered cookie → 401; non-admin hitting admin route → 403.
- Call-graph reachability: `grep -r "requireAdmin" app/` matches at least one protected route (admin sources route lands with FID-005; interim proof via `/api/auth/me`).

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) initial design put verification in middleware — Edge runtime incompatible with firebase-admin, moved to server components; (2) missing logout route → added; (3) Google popup needs authorized-domain registration — deployment step recorded in FID-005 checklist. Converged. |

## Closure

Requires: implementation commit + emulator-mode auth flow evidence + grep showing session verification called from a server route.

## Implementation Evidence (2026-09-03)

- Static: type-check/lint/build clean. Routes registered: `/login` (○), `/api/auth/session`, `/api/auth/logout`, `/api/auth/me` (ƒ).
- Boundary verification (live): unauthenticated `GET /api/auth/me` → 401; `POST /api/auth/session` with garbage token → 401 `Invalid or expired credentials` (real Firebase verification rejecting the token — not a stub).
- Reachability: `requireAdmin` called from `app/api/auth/me`, both FID-005 admin routes.
- Env fix: emulator detection extended to FIREBASE_AUTH_EMULATOR_HOST/FIRESTORE_EMULATOR_HOST; `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` documented in `.env.example`.
- ~~BLOCKED (happy path)~~ RESOLVED (2026-09-03): operator activated Firebase Auth in console (Email/Password + Google enabled); CLI refresh token wired as ADC; Firestore DB provisioned + rules/indexes deployed.
- **Full end-to-end PASS (2026-09-03, `scripts/auth-crud-verify.ts`, 14/14)**: password sign-in via Identity Toolkit REST → session exchange → session cookie is a real RS256 Firebase session JWT (`HttpOnly; SameSite=lax; Max-Age=604800`, no `Secure` on dev) → `/api/auth/me` 200 → non-admin admin-GET → 403 → promote claim via Admin SDK → re-login → claim visible → create 201 → duplicate 409 → invalid 422 → PATCH 200 → soft DELETE. Test bugs fixed during verification (case-sensitive `SameSite` assertion; non-idempotent cleanup colliding on duplicate-URL 409) — product correct both times.
- Status `verified` (boundaries + full happy path).