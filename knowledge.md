# Project knowledge

This file gives agents context about your project: goals, commands, conventions, and gotchas.

## Quickstart
- Setup: `npm install` then `cp .env.example .env.local` and fill in values
- Dev: `npm run dev` (Next.js 16 Turbopack, http://localhost:3000)
- Type-check: `npm run type-check`
- Lint: `npm run lint` (runs eslint --fix)
- Build: `npm run build`
- Firebase emulators: `firebase emulators:start` (Auth :9099, Firestore :8080, UI :4000)

## Architecture
- Next.js 16 App Router + React 19 + TypeScript strict, UI via **HeroUI v3**
  (`@heroui/react` + `@heroui/styles`, Tailwind CSS 4 with `@theme` in `styles/globals.css`)
- Firebase **Auth** (email/password + Google; admin via custom claim `admin: true`)
- Firebase **Firestore** collections:
  - `content` — aggregated items, world-readable, server-written only
  - `sources` — feed/channel registry (type, url, config, fetch metadata), admin-only
  - `users` — profile docs keyed by uid, created server-side on first sign-in
- Scheduled fetching: **no Cloud Scheduler** (Blaze-only). Custom free pipeline:
  hourly GitHub Actions cron → `GET /api/cron/fetch` with `Authorization: Bearer CRON_SECRET`
- First source type: YouTube (Data API v3). RSS/Reddit/X deferred.
- Hosting: Vercel (Hobby). Firebase CLI used for rules/indexes/emulators only.

## Conventions
- Verify with `npm run type-check` + `npm run build` before declaring anything done
- Server-only code uses `firebase-admin`; client code uses `firebase` — never mix
- No `any` in new code; no secrets in client components (`NEXT_PUBLIC_` prefix only for public config)
- Path alias `@/*` → project root
- `resources/` contains legacy reference builds — never import from it, never commit it (git-ignored; excluded in tsconfig + eslint)
- ECHO Protocol governs workflow: see `dev/echo-v0.1.2-single-agent.md`, scope in `SCOPE.md`

## Gotchas
- Firestore rules in `firestore.rules` are default-deny; Admin SDK bypasses rules
- Turbopack `root` is pinned in `next.config.mjs` because `resources/` contains stray lockfiles
- GitHub Actions scheduled runs can be delayed 5-15 minutes — don't chase phantom "missed" fetches
