# aggroNATION

![engine status](https://img.shields.io/endpoint?url=https%3A%2F%2Faggro-nation.vercel.app%2Fapi%2Fstatus%2Fbadge.json)

AI content aggregator — surfaces the most engaging recent content from curated
sources (YouTube, RSS, Reddit, HuggingFace, Trendshift, Open Source Projects)
and ranks it by an engagement + freshness score. The ingestion engine runs
hourly; [aggro-nation.vercel.app/status](https://aggro-nation.vercel.app/status)
is its live heartbeat.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript strict
- **HeroUI v3** + Tailwind CSS 4
- **Supabase** — Postgres (data), service-role access from server code only
- **Hosting:** Vercel · **Ingestion:** GitHub Actions hourly cron → direct
  Supabase write → ISR purge webhook (`.github/workflows/cron-fetch.yml`)

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

### Environment variables

Copy `.env.example` and fill in (names are the contract — see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` — server-only data access
- `SUPABASE_DB_PASSWORD` — direct Postgres access for migration/backfill scripts
- `YOUTUBE_API_KEY` — YouTube Data API v3 key
- `CRON_SECRET` — random hex secret guarding `/api/cron/*` (`openssl rand -hex 32`);
  the same value must be set on Vercel (production) and as the GitHub repo secret

The GitHub Actions runner needs repo secrets `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `CRON_SECRET`.

Migrations live in `supabase/migrations/` and are applied in order via
`scripts/apply-migration.ts`.

## Scripts

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Dev server                                |
| `npm run build`     | Production build                          |
| `npm run type-check`| `tsc --noEmit`                            |
| `npm run lint`      | ESLint (`no-explicit-any` enforced)       |

## Architecture notes

- `lib/schemas/` — Zod schemas are the single source of truth for all rows;
  every read parses through them (momentum fields included — parse must not
  strip what the DB stores)
- `lib/repositories/` — the only code that touches Supabase; listing/search
  queries are pinned SQL functions (`supabase/migrations/`), not ad-hoc chains
- Content dedupe via deterministic row IDs (`{sourceType}_{externalId}`) —
  idempotent upserts, no read-before-write
- Rating = engagement×0.6 + freshness×0.4 with 14-day decay, snapshotted at
  fetch time; momentum (Rising) measures against carried day/week baselines,
  never per-cycle deltas (decay makes those noise)
- Every fetch cycle is recorded (`fetch_cycles`) and rendered at `/status`;
  writes purge the ISR cache via the cron webhook so production never lags
  the pipeline
- Home and listing pages are ISR against real data, with honest empty states
  until the pipeline fills them — nothing is faked, anywhere

## License

MIT
