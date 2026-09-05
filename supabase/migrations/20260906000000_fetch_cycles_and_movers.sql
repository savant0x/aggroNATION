-- ============================================================================
-- FID-2026-0905-002 streams A+C — engine observability + Rising tuning.
--
-- fetch_cycles: append-only log of every ingestion cycle. Deliberate
-- deviation from the text-PK entity convention (bookmarks/comments): this is
-- a LOG with no natural key — identity ordering is the honest record. One
-- row per runFetchAllSources() execution, written by cycle-repo with
-- call-site catch (observability never breaks ingestion).
--
-- No content-table changes: existing setof-content read functions are NOT
-- invalidated (the FID-2026-0904-022 self-correct does not repeat).
-- ============================================================================

create table public.fetch_cycles (
  id                   bigint generated always as identity primary key,
  ran_at               timestamptz not null,
  duration_ms          int not null default 0,
  total_sources        int not null default 0,
  succeeded            int not null default 0,
  failed               int not null default 0,
  items_fetched        int not null default 0,
  -- Array of {sourceId, sourceType, sourceName, ok, itemsFetched, error,
  -- configError} — the full outcome record, denormalized on purpose so the
  -- status page derives per-source health from ONE row read.
  outcomes             jsonb not null default '[]'::jsonb,
  scrub_findings_count int not null default 0
);
create index if not exists fetch_cycles_ran_at_idx on public.fetch_cycles (ran_at desc);

-- ---------------------------------------------------------------------------
-- Stream C: content_rising retune — same signature (zero caller breakage),
-- relative momentum ranking. Evidence (2026-09-05): absolute-delta ranking
-- returned 2 rows over 168h because p90 delta is 0.0001 and ratings decay
-- between cycles. Relative gain with a 0.05 floor bounds amplification at
-- 20x and surfaces percentage-climbers the absolute view drowns.
-- ---------------------------------------------------------------------------
create or replace function public.content_rising(
  p_lookback_hours int,
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and c.published_at >= now() - make_interval(hours => greatest(p_lookback_hours, 1))
    and coalesce((c.metrics->>'rating')::numeric, 0)
        > coalesce((c.metrics->>'prev_rating')::numeric, (c.metrics->>'rating')::numeric, 0)
  order by (coalesce((c.metrics->>'rating')::numeric, 0)
          - coalesce((c.metrics->>'prev_rating')::numeric, (c.metrics->>'rating')::numeric, 0))
          / greatest(coalesce((c.metrics->>'prev_rating')::numeric, 0), 0.05) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;

-- ---------------------------------------------------------------------------
-- Stream C: biggest absolute movers over a day window (Rising page's
-- "biggest moves" section). Strict gainers only — decay cannot fake a move.
-- ---------------------------------------------------------------------------
create or replace function public.content_top_movers(
  p_days int,
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and c.updated_at >= now() - make_interval(days => greatest(p_days, 1))
    and coalesce((c.metrics->>'rating')::numeric, 0)
        > coalesce((c.metrics->>'prev_rating')::numeric, (c.metrics->>'rating')::numeric, 0)
  order by (coalesce((c.metrics->>'rating')::numeric, 0)
          - coalesce((c.metrics->>'prev_rating')::numeric, (c.metrics->>'rating')::numeric, 0)) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;
