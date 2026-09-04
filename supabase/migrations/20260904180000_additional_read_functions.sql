-- FID-2026-0904-010 — additional read-path functions discovered during the
-- repository port (getTopContent / content_top_rated, regression parity).

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

-- jsonb merge-patch helpers: PostgREST .update() REPLACES jsonb columns, so
-- partial patches (source config / fetch metadata) must merge in SQL with
-- `column || patch` (Firestore set(merge) semantics — atomic, no read race).
create or replace function public.source_update_config(
  p_id text,
  p_config jsonb
) returns void
language sql
as $$
  update public.sources
  set config = coalesce(config, '{}'::jsonb) || p_config,
      updated_at = now()
  where id = p_id;
$$;

create or replace function public.source_update_metadata(
  p_id text,
  p_metadata jsonb
) returns void
language sql
as $$
  update public.sources
  set metadata = coalesce(metadata, '{}'::jsonb) || p_metadata,
      updated_at = now()
  where id = p_id;
$$;
