> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-012 — Client Firebase Env Resolution (Build-Time Inlining Defect)

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-012-client-env-resolution.md` |
| **ID**       | FID-2026-0903-012 |
| **Severity** | minor |
| **Status**   | verified (implementation complete — see evidence below) |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator bug report (Firebase config console error on /admin) |

## Summary

After the operator's `.env.local` was corrupted and rebuilt (session earlier today), `/admin` still threw "Firebase client configuration incomplete. Missing environment variables: NEXT_PUBLIC_FIREBASE_*" from the **client** bundle, while server-side routes read the same variables fine. Root cause: `lib/firebase/env.ts` evaluates `process.env[key]` in a loop at module scope. `next build`/Turbopack statically inlines only *literal-key* references (`process.env.NEXT_PUBLIC_FIREBASE_API_KEY`) into client bundles; *dynamic-key* lookups (`process.env[key]`) cannot be inlined and resolve to `undefined` in the browser. The throw is therefore guaranteed on any page whose client bundle imports `lib/firebase/client.ts` — the error the operator saw is structural, not a stale-server artifact, and would reproduce in production.

## Evidence (RED)

- Operator console error on `/admin`: Firebase config incomplete, thrown from `readClientEnv (lib/firebase/env.ts:41)` via `lib/firebase/client.ts` (module evaluation) — client bundle.
- Server modules (`admin.ts` via `getFirebaseProjectId`) read the same vars successfully at runtime — proving `.env.local` itself is correct.
- `lib/firebase/env.ts:24-46` — `for (const key of REQUIRED_CLIENT_VARS) { const value = process.env[key]; … }`: dynamic key access at module scope.
- Next.js documents that non-literal `process.env` access is not replaced in client bundles (only `NEXT_PUBLIC_`-prefixed *static* references are inlined).

## Proposed Solution (GREEN)

1. **Literal-key env reading** in `lib/firebase/env.ts`: replace the loop with explicit static references:
   ```ts
   const values = {
     NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
     …
   };
   const missing = REQUIRED_CLIENT_VARS.filter((k) => !values[k]);
   ```
   The loop over `REQUIRED_CLIENT_VARS` remains for validation only. This preserves the throw-loudly contract (Law: fail at startup, list ALL missing) while making every access statically inlinable.
2. **Guarantee server parity**: `getFirebaseProjectId()` continues to read `firebaseClientEnv` (now correctly populated in both environments) — `lib/firebase/admin.ts`'s ADC projectId explicit-pass keeps working.
3. **No `.env` change, no dependency change.**

Alternatives considered: (a) initializing Firebase lazily with a user-facing "config missing" state — hides a build defect and degrades UX; (b) importing a generated `env.d.ts` of constants — build-time codegen overkill for six keys; (c) `NEXT_PUBLIC_` object spread from `process.env` — not statically analyzable, same defect.

## Impact Analysis

- Modified: `lib/firebase/env.ts` only. Blast radius: client Firebase init (login flow, health route import) — the fix makes the existing intended behavior actually work in client bundles.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint clean; grep confirms every `process.env.NEXT_PUBLIC_` access in `lib/` is literal-key.
- Method 2 (dynamic): dev-server `/login` (the page that imports `client.ts`) loads with **no** console config error; served client chunk contains the inlined literal API-key value (`curl /login` HTML + chunk grep for the known `NEXT_PUBLIC_FIREBASE_PROJECT_ID` value `aggronation-app`); `/admin` after a fresh client navigation produces no config error.
- Call-graph reachability: unchanged imports — `lib/firebase/client.ts` and `admin.ts` still consume `firebaseClientEnv`/`getFirebaseProjectId`.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) initial hypothesis (stale dev server) was wrong — proved structural by reproducing the throw from a freshly compiled client chunk; (2) `REQUIRED_CLIENT_VARS.filter` needs `values` typed as `Record<Key, string | undefined>` before the missing-check narrows it; (3) server bundle never had the defect (runtime `process.env` is complete) — which is exactly why the bug survived earlier server-only verification. Converged. |

## Closure

Requires: implementation file:line, static gates, client-chunk inlining evidence, /login + /admin clean-load probes.

## Implementation Evidence (2026-09-03)

- `lib/firebase/env.ts` rewritten: literal-key `process.env.NEXT_PUBLIC_*` references (statically inlinable), `REQUIRED_CLIENT_VARS.filter` for the missing-list contract, module docstring documents the client-bundle inlining rule for future maintainers.
- Static: type-check + lint + build clean.
- Dynamic: production client chunk grep — `aggronation-app` (project id literal) found in `.next/static/chunks/*.js` (inlining confirmed; before the fix no chunk contained any value); `/login` served HTML contains `aggronation-app.firebaseapp.com`.
- /login renders 200 with no config throw; FID-009 admin suite re-run post-change → 12/12 PASS.
- Status `verified`.