-- ============================================================================
-- FID-2026-0905-002 self-correct, part 2: the momentum functions read the
-- carried day/week baselines (metrics.ratingDayAgo / ratingWeekAgo,
-- refreshed by refreshMomentumBaselines each cycle) instead of prev_rating.
-- prev_rating stays: it is the raw per-cycle record and the upsert seed.
-- Rows without a baseline yet are honestly excluded (not rising) until the
-- refresher seeds them.
-- ============================================================================

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
    and (c.metrics->>'rating')::numeric
        > coalesce((c.metrics->>'ratingDayAgo')::numeric, (c.metrics->>'rating')::numeric)
  order by ((c.metrics->>'rating')::numeric
          - coalesce((c.metrics->>'ratingDayAgo')::numeric, (c.metrics->>'rating')::numeric))
          / greatest(coalesce((c.metrics->>'ratingDayAgo')::numeric, 0), 0.05) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;

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
    and (c.metrics->>'rating')::numeric
        > coalesce((c.metrics->>'ratingWeekAgo')::numeric, (c.metrics->>'rating')::numeric)
  order by (c.metrics->>'rating')::numeric
         - coalesce((c.metrics->>'ratingWeekAgo')::numeric, (c.metrics->>'rating')::numeric) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;
