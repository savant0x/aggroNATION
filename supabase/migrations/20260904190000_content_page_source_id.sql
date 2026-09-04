-- FID-2026-0904-010 — content_page gains an optional single-source scope so
-- deterministic pagination tests can run against their own source even when
-- real data shares the type.

create or replace function public.content_page(
  p_types text[],
  p_page_size int,
  p_before_published timestamptz default null,
  p_before_id text default null,
  p_after_published timestamptz default null,
  p_after_id text default null,
  p_source_id text default null
) returns setof public.content
language plpgsql stable
as $$
begin
  if p_after_published is not null then
    -- Prev page: the `p_page_size` rows strictly newer than the bound,
    -- ascending-windowed then re-reversed so the caller always reads desc.
    return query
      select * from (
        select c.*
        from public.content c
        where c.archived = false
          and (p_types is null or c.source_type = any(p_types))
          and (p_source_id is null or c.source_id = p_source_id)
          and (c.published_at, c.id) > (p_after_published, p_after_id)
        order by c.published_at asc, c.id asc
        limit p_page_size
      ) t
      order by t.published_at desc, t.id desc;
  else
    return query
      select c.*
      from public.content c
      where c.archived = false
        and (p_types is null or c.source_type = any(p_types))
        and (p_source_id is null or c.source_id = p_source_id)
        and (p_before_published is null or (c.published_at, c.id) < (p_before_published, p_before_id))
      order by c.published_at desc, c.id desc
      limit p_page_size;
  end if;
end;
$$;
