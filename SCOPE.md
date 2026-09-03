# SCOPE — aggroNATION rebuild

Approved scope (operator-confirmed via interactive Q&A, 2026-09-03):

## Approved work items
- [x] Fresh rebuild of aggroNATION (AI content aggregator) at workspace root
- [x] `resources/` is reference-only — old builds of the same idea, no code reuse
- [x] Framework: Next.js App Router + TypeScript strict + Tailwind + ESLint
- [x] UI: HeroUI v3 (@heroui/react + @heroui/styles) via heroui-cli (installed globally)
- [x] Backend: Firebase — Auth (email/password + Google), Firestore
- [x] Hosting: Vercel (free tier) — NOT Firebase App Hosting (requires Blaze/billing)
- [x] Scheduled content fetch: custom free solution — protected webhook + external cron
      (GitHub Actions), no Cloud Scheduler
- [x] Firebase project created via Firebase CLI
- [x] First content source: YouTube (Data API v3)

## Amendment 1 (2026-09-03): full-system build
Operator decision: build the system out fully — **mock data is rejected** (ECHO
Law 5). Home page is designed against real Firestore data. Direction: dark
"aggro neon". All complex work is FID-bound; FIDs 001–006 below cover the full
system and require operator approval before implementation.

## Amendment 2 (2026-09-03): FID approval
Operator approved all six converged FIDs. Implementation order per operator:
001 → 002 → 003 → 006 (milestone 1: data + pipeline + home), then 004 + 005
(auth + admin CRUD). ECHO IMPLEMENT phase begins; each FID verified against
its verification plan before the next starts.

## Amendment 3 (2026-09-03): FIDs 004–005 implemented
All six approved FIDs now implemented and verified (static gates + live
boundary probes). BLOCKED items requiring operator input: Firestore/Auth
happy-path verification needs service-account credentials
(FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY) — no gcloud/ADC
and no Java (emulators) available on this machine. Alternative: install Java
+ run emulators, or supply creds. Operator decides.

## Amendment 4 (2026-09-03): credentials wired, dynamic verification passed
Operator chose to wire credentials via existing firebase-cli login. Refresh
token converted to standard ADC (gcloud well-known path) — Admin SDK
authenticates without new installs. Firestore database created, API enabled,
rules+indexes deployed live. Dynamic verification: FID-002 **13/13 PASS**
(three production bugs found & fixed — see FID), FID-003 webhook+service
cycle **PASS** (CRON_SECRET generated). Firebase Auth instance requires
one-time console activation (all CLI paths exhausted — CONFIGURATION_NOT_FOUND):
console.firebase.google.com → Authentication → Get started. FID-004/005
happy-path awaits that click.

## Amendment 5 (2026-09-03): Auth activated, all six FIDs fully verified
Operator enabled Firebase Auth (Email/Password + Google) via console. Final
dynamic run `scripts/auth-crud-verify.ts`: **14/14 PASS** — password sign-in →
session exchange (real RS256 Firebase session JWT, HttpOnly/lax/7d) → identity
probe → non-admin 403 → promote claim → re-login → admin CRUD (201/409/422/
PATCH 200/soft-delete) → idempotent cleanup. FID-004/005 moved to `verified`
(boundaries + full happy path). **All approved FIDs complete.** Remaining for
the operator: YOUTUBE_API_KEY (live fetch leg), Vercel deploy + authorized
domains. Deferred items unchanged.

## Deferred (awaiting operator approval — never silently dropped)
- [DEFERRED] RSS / Reddit / X fetchers — roadmap after YouTube pipeline is proven
- [DEFERRED] Admin dashboard UI — after auth + pipeline are wired
- [DEFERRED] Content rating decay algorithm — schema designed for it, recalc job later
- [DEFERRED] Test suite — after pipeline is stable

## Open out-of-scope items discovered (Law 2 Additional Rule)
- [OPEN-OUT-OF-SCOPE] Workspace root is not a git repository — ECHO G2 (commit-hashed
  FID closure) unsatisfiable until `git init` (operator decision required)
- [OPEN-OUT-OF-SCOPE] `resources/*/.env*` files contain live-looking secrets
  (DATABASE_URL, YOUTUBE_API_KEY, NEXTAUTH_SECRET, JWT_SECRET, …) — rotation
  recommended; resources/ will be git-ignored to prevent accidental commits
