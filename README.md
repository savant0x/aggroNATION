# aggroNATION

AI content aggregator — surfaces the most engaging recent content from curated
sources (YouTube first; RSS / Reddit / X planned) and ranks it by an
engagement + freshness score.

Fresh rebuild. Legacy builds live in `resources/` for reference only and are
git-ignored.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript strict
- **HeroUI v3** + Tailwind CSS 4
- **Firebase** — Auth (Email/Password + Google), Firestore
- **Hosting:** Vercel · **Cron:** external scheduler → protected webhook
  (`.github/workflows/cron-fetch.yml`)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

### Environment variables

Copy `.env.example` and fill in:

- `NEXT_PUBLIC_FIREBASE_*` — Firebase web SDK config (console → Project settings)
- `YOUTUBE_API_KEY` — YouTube Data API v3 key
- `CRON_SECRET` — random hex secret for the fetch webhook (`openssl rand -hex 32`)
- Admin credentials (`FIREBASE_ADMIN_*`) — optional in dev; ADC is used when present

Firebase Auth requires one-time activation in the console
(Authentication → Get started) with Email/Password and Google enabled.

### Admin access

Promote a signed-up user to admin (custom claim consumed by `requireAdmin()`
and the Firestore rules):

```bash
npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/promote-admin.ts <uid>
```

## Scripts

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Dev server                                |
| `npm run build`     | Production build                          |
| `npm run type-check`| `tsc --noEmit`                            |
| `npm run lint`      | ESLint (`no-explicit-any` enforced)       |

## Architecture notes

- `lib/schemas/` — Zod schemas are the single source of truth for all documents
- `lib/repositories/` — the only code that touches Firestore; queries are
  contractually matched to `firestore.indexes.json`
- Content dedupe via deterministic doc IDs (`{sourceType}_{externalId}`) —
  idempotent writes, no read-before-write
- Rating = engagement×0.6 + freshness×0.4 with 14-day decay
- Home page is server-rendered with 5-minute ISR against real Firestore data
  (honest empty states until the pipeline fills it)

## License

MIT
