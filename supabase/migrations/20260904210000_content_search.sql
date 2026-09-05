-- ============================================================================
-- FID-2026-0904-021 — server-side content search. PostgREST's or-list parser
-- cannot express a jsonb::text cast inline ("failed to parse logic tree",
-- probed live 2026-09-05), and search must cover the tags jsonb array, so
-- matching runs in SQL — the same pinned read-function pattern as
-- content_capped / content_page_offset. The pattern (with % wildcards) is
-- bound as a parameter and sanitized in the repository layer (no commas,
-- parens, percent, or backslashes), so ilike here is injection-safe.
-- source_name is included so a channel/subreddit name finds its items.
-- ============================================================================

create or replace function public.content_search(
  p_query text,
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false
    and (
      c.title         ilike p_query
      or c.excerpt    ilike p_query
      or c.author     ilike p_query
      or c.source_name ilike p_query
      or c.tags::text ilike p_query
    )
  order by c.published_at desc, c.id desc
  limit greatest(p_limit, 1);
$$;
