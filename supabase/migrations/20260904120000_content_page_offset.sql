-- FID-2026-0904-012 item 6 — offset pagination for content listings.
--
-- The keyset function content_page (migrations 180000/190000) is replaced by
-- an offset variant: listing pagination moves from query strings (?cursor=…)
-- to path segments (/{type}/page/N) so every listing page becomes a stable,
-- shareable, ISR-cachable URL — and a path segment can only encode an
-- offset, not an opaque cursor. Trade-off (documented in the FID): offset
-- pagination can shift by one row when items are inserted mid-browse —
-- negligible at 20/page with hourly fetches, and Supabase has no read quota.

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

-- The keyset variants are now unreferenced (repo switched to content_page_offset).
-- Two existed: the 180000 six-arg original and the 190000 seven-arg
-- source-scoped overload (create-or-replace with a new signature creates a
-- second function, not a replacement). Drop both.
drop function if exists public.content_page(
  text[], int, timestamptz, text, timestamptz, text
);
drop function if exists public.content_page(
  text[], int, timestamptz, text, timestamptz, text, text
);
