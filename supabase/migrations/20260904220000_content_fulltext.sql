-- ============================================================================
-- FID-2026-0904-022 stream A — full-text body search. content_text holds the
-- plain-text extraction of content_html (written by the repository layer via
-- htmlToPlainText — never the raw HTML, so markup tokens can never pollute
-- results). search_tsv is a stored generated column so Postgres maintains it
-- on every write; explicit 'english' config keeps to_tsvector IMMUTABLE
-- (required for generated columns). GIN index makes @@ lookups index-driven.
-- content_search v2: metadata ilike chain OR full-text match; plainto_tsquery
-- neutralizes FTS operator syntax in raw user input; the sanitized pattern
-- remains parameter-bound as in v1. Ordering stays published_at desc —
-- ts_rank interleaving with metadata matches would be inconsistent.
-- ============================================================================

alter table public.content add column if not exists content_text text;

alter table public.content add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content_text, ''))) stored;

create index if not exists content_search_tsv_idx
  on public.content using gin (search_tsv);

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
      or c.search_tsv @@ plainto_tsquery('english', p_query)
    )
  order by c.published_at desc, c.id desc
  limit greatest(p_limit, 1);
$$;
