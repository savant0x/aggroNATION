-- ============================================================================
-- FID-2026-0904-023 stream K (addendum) — the "one week ago" wrapper. Split
-- into its own migration because 20260905010000 was already recorded when
-- this function was designed (the purity-rule self-correct); the applier
-- skips recorded versions, so the wrapper ships here.
-- ============================================================================

create or replace function public.content_time_machine_week(
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and c.published_at >= date_trunc('day', now() - interval '7 days')
    and c.published_at < date_trunc('day', now() - interval '7 days') + interval '1 day'
  order by coalesce((c.metrics->>'rating')::numeric, 0) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;
