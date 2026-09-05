-- ============================================================================
-- FID-2026-0904-023 streams D+G+H+J+K — discovery read functions. New
-- functions only: the content row shape is untouched, so no existing
-- setof-content function is invalidated (the FID-022 self-correct does not
-- repeat). All wall-clock logic lives here, not in components (purity rule).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- D: related items — same type, ranked by tag overlap then same-source
-- ---------------------------------------------------------------------------
create or replace function public.content_related(
  p_content_id text,
  p_limit int
) returns setof public.content
language sql stable
as $$
  with base as (
    select c.source_type, c.tags, c.source_id
    from public.content c
    where c.id = p_content_id
  )
  select c.*
  from public.content c, base b
  where c.id <> p_content_id
    and c.archived = false
    and c.source_type = b.source_type
  order by
    -- rows with tag overlap first (jsonb ?| any-of), then same source,
    -- then freshness — stable tiebreak on id
    not (c.tags ?| (select array(select jsonb_array_elements_text(b.tags)))),
    (c.source_id <> b.source_id),
    c.published_at desc,
    c.id desc
  limit greatest(p_limit, 1);
$$;

-- ---------------------------------------------------------------------------
-- G: tag listing — items whose tags jsonb array contains the tag
-- ---------------------------------------------------------------------------
create or replace function public.content_by_tag(
  p_tag text,
  p_limit int,
  p_offset int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and c.tags ? p_tag
  order by c.published_at desc, c.id desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

create or replace function public.content_count_by_tag(
  p_tag text
) returns bigint
language sql stable
as $$
  select count(*)
  from public.content c
  where c.archived = false
    and c.tags ? p_tag;
$$;

-- Top tags sitewide (for the sitemap + a future /tags index).
create or replace function public.top_tags(
  p_limit int
) returns table (tag text, items bigint)
language sql stable
as $$
  select t.value as tag, count(*) as items
  from public.content c,
       jsonb_array_elements_text(c.tags) as t
  where c.archived = false
  group by t.value
  order by items desc, tag asc
  limit greatest(p_limit, 1);
$$;

-- ---------------------------------------------------------------------------
-- H: rising — items whose rating grew since the previous fetch cycle.
-- prev_rating is seeded = rating on first write after this ships, so the
-- first cycle yields delta 0 (no fake momentum); the page's empty state says
-- momentum needs two cycles.
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
    and coalesce((c.metrics->>'prev_rating')::numeric, (c.metrics->>'rating')::numeric, 0)
        < coalesce((c.metrics->>'rating')::numeric, 0)
  order by (coalesce((c.metrics->>'rating')::numeric, 0)
          - coalesce((c.metrics->>'prev_rating')::numeric, (c.metrics->>'rating')::numeric, 0)) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;

-- ---------------------------------------------------------------------------
-- J: repo entity — every item carrying the same github blob slug
-- ---------------------------------------------------------------------------
create or replace function public.content_repo_items(
  p_slug text,
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and c.github->>'slug' = p_slug
  order by c.published_at desc, c.id desc
  limit greatest(p_limit, 1);
$$;

-- ---------------------------------------------------------------------------
-- K: time machine — top items from the same UTC weekday one week ago
-- ---------------------------------------------------------------------------
create or replace function public.content_time_machine(
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and c.published_at >= p_day_start
    and c.published_at < p_day_end
  order by coalesce((c.metrics->>'rating')::numeric, 0) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;

-- Convenience wrapper for the home strip: the "one week ago" window is
-- computed here (DB wall-clock) so callers never read Date.now() during
-- render (the purity rule rejected the component-side version).
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
