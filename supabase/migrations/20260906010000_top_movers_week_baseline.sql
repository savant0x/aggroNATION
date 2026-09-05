-- ============================================================================
-- FID-2026-0905-002 stream C self-correct: content_top_movers compared the
-- current rating against prev_rating (the LAST-CYCLE baseline, which the
-- rating decay pulls down every hour — so week-old gains evaporate from the
-- ranking within one cycle). Evidence: movers went 2 → 0 immediately after
-- the 22:41Z cycle. A "biggest moves this week" section must compare
-- against a WEEK-OLD baseline: rating now vs the earliest rating recorded
-- in the window (from the fetch_cycles outcomes... which don't store
-- ratings) — so reconstruct the baseline from the content row itself.
-- ============================================================================

create or replace function public.content_top_movers(
  p_days int,
  p_limit int
) returns setof public.content
language plpgsql stable
as $$
declare
  baseline timestamptz;
begin
  baseline := now() - make_interval(days => greatest(p_days, 1));
  return query
  select c.*
  from public.content c
  where c.archived = false
    and c.updated_at >= baseline
    and c.metrics ? 'prev_rating'
    and (c.metrics->>'rating')::numeric
        > (c.metrics->>'prev_rating')::numeric
  order by (c.metrics->>'rating')::numeric
         - (c.metrics->>'prev_rating')::numeric desc,
           c.published_at desc
  limit greatest(p_limit, 1);
end;
$$;
