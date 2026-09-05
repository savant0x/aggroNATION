-- ============================================================================
-- FID-2026-0904-022 stream A (repair) — re-create the `returns setof content`
-- read functions after the content_fulltext migration. ALTER TABLE ADD
-- COLUMN invalidates SQL functions' cached row shapes: the next call fails
-- with "return type mismatch in function declared to return content"
-- (observed live 2026-09-05 on every listing + home section). Recreating the
-- functions re-plans them against the new 21-column row shape.
-- content_capped enumerates columns explicitly (its ranked CTE carries an
-- extra rn column that must NOT leak into the result), so its list gains
-- content_text + search_tsv in table-appended order; the other three select
-- c.* and are recreated verbatim.
-- ============================================================================

create or replace function public.content_capped(
  p_types text[],
  p_cap int
) returns setof public.content
language sql stable
as $$
  with ranked as (
    select c.*,
           row_number() over (
             partition by c.source_id
             order by c.published_at desc, c.id desc
           ) as rn
    from public.content c
    where c.archived = false
      and c.source_type = any(p_types)
      and c.source_id in (
        select s.id from public.sources s
        where s.enabled and not s.archived and s.type = any(p_types)
      )
  )
  select id, source_id, source_type, external_id, title, excerpt, content_html,
         url, thumbnail_url, source_name, github, author, published_at, tags,
         metrics, featured, archived, created_at, updated_at,
         content_text, search_tsv
  from ranked
  where rn <= greatest(p_cap, 1);
$$;

create or replace function public.content_page_offset(
  p_types text[],
  p_page_size int,
  p_page int,
  p_source_id text default null
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and (p_types is null or c.source_type = any(p_types))
    and (p_source_id is null or c.source_id = p_source_id)
  order by c.published_at desc, c.id desc
  limit greatest(p_page_size, 1)
  offset (greatest(p_page, 1) - 1) * greatest(p_page_size, 1);
$$;

create or replace function public.content_top_views(
  p_source_id text,
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false and c.source_id = p_source_id
  order by coalesce(((c.metrics->>'views')::int), 0) desc, c.published_at desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.content_top_rated(
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
  order by coalesce(((c.metrics->>'rating')::numeric), 0) desc,
           c.published_at desc
  limit greatest(p_limit, 1);
$$;
