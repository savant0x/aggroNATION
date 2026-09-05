> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-014 — Registration + Auth Navigation UX

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-014-auth-registration-ux.md` |
| **ID**       | FID-2026-0903-014 |
| **Severity** | major |
| **Status**   | verified (implementation complete — see evidence below) |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator report (logged out → no way to log back in; full registration page required) |

## Summary

Auth UX has three gaps. (1) After signing out, there is **no visible way to sign back in** — the navbar has no account affordance; only `/admin` redirects to the hidden `/login` route. (2) There is **no registration page** — new users depend on Google popup or console-created accounts; a public product with comments needs self-service email/password sign-up. (3) Session persistence itself is already sound (7-day httpOnly Firebase session cookie + `users/{uid}` profile doc, FID-004) — registration and sign-in simply reuse it.

## Evidence (RED)

- Operator: "logged out, there is no way to login, need to make a full registration page, with cookies and full persistance".
- `grep redirect("/login") app/` → only `app/admin/page.tsx:34`; navbar (`components/navbar.tsx`) renders zero auth links; `app/` has no `register` route.
- `app/api/auth/logout/route.ts` exists (POST, clears cookie) with no UI caller.
- `lib/firebase/client.ts` exports the web SDK; login page pattern (`exchangeForSession` → `resolvePostLoginPath`) is the established client auth flow.

## Proposed Solution (GREEN)

1. **`app/(auth)/register/page.tsx`** (client): email + password + display-name form → `createUserWithEmailAndPassword` (updateProfile with display name) → session exchange (creates the `users/{uid}` profile doc with email + lastSignInAt — persistence inherited, not reimplemented) → post-login path resolution (admin → `/admin`, else `/`). Google button reuses `signInWithPopup` flow. Errors mapped to human messages (`auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-email`, popup errors). Cross-links to `/login`.
2. **`components/auth-nav.tsx`** (client, replaces `AdminNavLink.tsx` — Law 13, one component/one probe): single `/api/auth/me` probe drives three states — signed-out → **Sign in** link; signed-in non-admin → email local-part chip; admin → email chip + **Admin** link; always a **Sign out** button when signed in. Sign out → POST `/api/auth/logout` → `router.refresh()` + `router.push("/")`.
3. **`components/navbar.tsx`** — render `<AuthNav />` (desktop + mobile menus), remove `AdminNavLink` import.
4. **`app/(auth)/login/page.tsx`** — add "New here? Create an account" link to `/register`.
5. **Persistence** — no changes needed: cookie maxAge 7 days (session route), profile doc merge-creates on every exchange; registration flows through the same exchange.

Alternatives considered: (a) magic-link-only auth — adds email infra dependency, rejected for local dev; (b) separate /logout page — POST from the navbar is simpler; (c) keeping AdminNavLink — two probe components for the same endpoint violates Law 13.

## Impact Analysis

- New: `app/(auth)/register/page.tsx`, `components/auth-nav.tsx`. Modified: `components/navbar.tsx`, `app/(auth)/login/page.tsx`. Deleted: `components/admin/AdminNavLink.tsx`.
- No schema/API/dependency changes (Firebase web SDK already present; logout API exists).
- Blast radius: navbar on every page; new public route.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; route table lists `/register`; grep confirms `AdminNavLink` zero references and `auth-nav` rendered by navbar.
- Method 2 (dynamic): REST-mimicked registration (`accounts:signUp`) → session exchange → `/api/auth/me` 200 (persistence) → POST logout → `/api/auth/me` 401; user profile doc exists in Firestore; display name visible. UI state checks via served HTML (auth nav is client-rendered; code-level reachability greps).
- Call-graph reachability: `grep -n "AuthNav" components/navbar.tsx`; `grep -rn "AdminNavLink" .` → zero; `grep -n "register" app/(auth)/login/page.tsx`.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) AuthNav SSR renders nothing until the probe resolves — accepted (brief link-less navbar on first paint); (2) display name belongs in the profile doc too → registration stores it on the Auth user AND merges into `users/{uid}` at exchange via existing route; (3) sign-out must hard-refresh the admin page state → `router.refresh()` after push covers server components. Converged. |

## Closure

Requires: implementation file:line, static gates, registration/persistence/logout probe output, operator confirmation of the auth UX.

## Implementation Evidence (2026-09-03)

- `app/(auth)/register/page.tsx` — email+password+display-name sign-up (`createUserWithEmailAndPassword` + `updateProfile`), Google option, session exchange, role-aware post-login redirect, humanized errors (EMAIL_EXISTS / WEAK_PASSWORD / INVALID_EMAIL / popup), link to /login.
- `components/auth-nav.tsx` — replaces AdminNavLink (deleted): single /api/auth/me probe → signed-out "Sign in" link / user chip / admin link + Sign out (POST /api/auth/logout → router.refresh). Rendered in navbar desktop + mobile.
- `app/(auth)/login/page.tsx` — "New here? Create an account" link to /register.
- SECURITY FIX (found by the verification probe): logout previously only cleared the cookie — the session value stayed valid up to 7 days if copied. Route now revokes refresh tokens (adminAuth.revokeRefreshTokens) before clearing; verifySessionCookie(,true) rejects pre-revocation cookies.
- Static: type-check + lint + build clean; route table: ○ /register.
- Dynamic: `scripts/auth-registration-verify.ts` — **8/8 PASS**: signUp 200; session exchange; /me identity; users/{uid} profile doc; duplicate → EMAIL_EXISTS; weak password rejected; logout 200; post-logout /me → 401 (revocation proven with cookie attached). Probe bug note: first logout assertion sent no cookie — fixed to mirror the browser.
- Operator state: spencerhowell84@gmail.com promoted to admin (claim set); after re-sign-in the Admin link + auto-redirect apply.
- Status `verified`. Pending for `closed`: operator confirmation of the auth UX.