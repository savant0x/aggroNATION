> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-001 — Firebase Core Initialization

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-001-firebase-core.md` |
| **ID**       | FID-2026-0903-001 |
| **Severity** | critical |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md Amendment 1 (operator-confirmed full-system build) |

## Summary

The rebuilt aggroNATION has Firebase env vars in `.env.local` and SDKs installed but zero Firebase initialization code. Every other subsystem (data layer, auth, pipeline, home page data) depends on correctly initialized client and server Firebase apps. This FID establishes the single initialization point for each context, with env validation at module load so misconfiguration fails loudly at build/dev time instead of silently at runtime.

## Evidence (RED)

- `grep -r "firebase" app/ lib/ components/` → only `package.json` dependency entries; no `initializeApp`, no `getApps` anywhere in source.
- `firebase apps:sdkconfig` output (2026-09-03) confirms project `aggronation-app`, web app ``<web-app-id-redacted>``, config already mirrored in `.env.local`.
- `firebase-admin` is in dependencies but never imported.
- No `lib/firebase/*` directory exists.

## Proposed Solution (GREEN)

Two separate, single-purpose modules — never mixed (knowledge.md convention):

1. **`lib/firebase/client.ts`** — browser SDK. `initializeApp` guarded by `getApps().length` check (idempotent under HMR/fast-refresh; Next.js client components may re-evaluate modules). Reads only `NEXT_PUBLIC_FIREBASE_*` vars. Exports `firebaseApp`, `auth`, `db`, `googleProvider`. Export `auth` lazily via getters is rejected — direct exports are simpler and tree-shaking gains are irrelevant at this scale; the getApps() guard already solves re-initialization.
2. **`lib/firebase/admin.ts`** — Admin SDK, `import "server-only"` enforced. Uses `applicationDefault()` credentials in dev (via `gcloud auth application-default login` / emulator) and a `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY` service-account pair in production, chosen by env presence — explicit over ambient, so Vercel config errors surface as a clear thrown message, not a cryptic ADC failure. Module-level lazy singleton via `getApps()` guard again. Exports `adminApp`, `adminAuth`, `adminDb`.
3. **`lib/firebase/env.ts`** — tiny validator exporting a typed `firebaseEnv` object; throws at import time listing ALL missing vars (not just the first) for fast operator feedback.

Alternatives considered: (a) react-firebase-hooks/context provider wrapper — rejected, adds dependency without need since we consume Auth/Firestore imperatively in server actions and hooks directly; (b) single universal module — rejected, admin SDK must never enter client bundles and `server-only` import is the hard guarantee.

## Impact Analysis

- Files created: `lib/firebase/env.ts`, `lib/firebase/client.ts`, `lib/firebase/admin.ts`.
- Dependencies: none added (`firebase`, `firebase-admin` already installed).
- No UI changes; no route changes. Blast radius: zero until consumers land in FID-002/003/004.
- `.env.local` and `.env.example` gain `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` entries (server-only, never `NEXT_PUBLIC_`).

## Verification Plan (AUDIT)

- Method 1 (static): `npm run type-check` and `npm run build` clean; build output must NOT contain admin SDK in client chunks (grep `.next/static` for `firebase-admin` absence).
- Method 2 (dynamic): boot `firebase emulators:start`, `npm run dev`, hit `/api/health` route (added by this FID) which pings adminDb `signInAnonymously`-free server ping and client `db` ping, both returning `{ ok: true }` JSON.
- Call-graph reachability: `grep -r "lib/firebase/admin" app/` matches the health route import; `grep -r "lib/firebase/client" components/ app/` matches at least the health route client probe.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) emulator support unspecified → added `FIREBASE_EMULATOR_HOST` handling in admin.ts + client connectFirestoreEmulator; (2) env validation initially listed only first missing var → fixed to collect all; (3) `server-only` package not in deps → add it. Converged. |

## Closure

Requires: commit SHA or file:line ranges + grep showing `app/api/health/route.ts` importing both modules, and build output excluding admin SDK from client bundles.

## Implementation Evidence (2026-09-03)

- Static: `tsc --noEmit` clean; `next build` clean with `/api/health` registered (ƒ Dynamic); `grep -rl firebase-admin .next/static/` → no matches (admin SDK absent from client bundles).
- Dynamic: `GET /api/health` → `{"ok":true,"checks":{"adminApp":{"initialized":true},"clientApp":{"initialized":true,"projectId":"aggronation-app"}}}`.
- Deviation fix found during implementation: ADC project detection fails on machines without gcloud config → `projectId` now passed explicitly to `initializeApp` (documented in code).
- Status `verified`; `closed` pending git init (G2 commit-hash requirement — see SCOPE open item).