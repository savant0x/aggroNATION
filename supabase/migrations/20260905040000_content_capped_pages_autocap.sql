-- FID-2026-0905-007 rev 2: auto-cap. p_cap NULL derives a fair per-source
-- share from the ACTIVE source count: max(3, ceil(240 / n)). Many-source
-- categories keep flood protection; few-source categories pool their full
-- depth (2 sources -> cap 120 -> pool 136 -> ~7 pages of 20). Count twin
-- accepts the same NULL semantics.
CREATE OR REPLACE FUNCTION public.content_capped_pages(
  p_types text[],
  p_cap int,
  p_limit int,
  p_page int
)
RETURNS SETOF public.content
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cap int;
  v_sources int;
BEGIN
  IF p_cap IS NOT NULL THEN
    v_cap := GREATEST(p_cap, 1);
  ELSE
    SELECT count(*) INTO v_sources
    FROM public.sources s
    WHERE s.enabled AND NOT s.archived AND s.type = ANY(p_types);
    v_cap := GREATEST(3, CEIL(240.0 / GREATEST(v_sources, 1))::int);
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT c.*,
           ROW_NUMBER() OVER (
             PARTITION BY c.source_id
             ORDER BY c.published_at DESC, c.id DESC
           ) AS rn
    FROM public.content c
    WHERE c.archived = false
      AND c.source_type = ANY(p_types)
      AND c.source_id IN (
        SELECT s.id FROM public.sources s
        WHERE s.enabled AND NOT s.archived AND s.type = ANY(p_types)
      )
  )
  SELECT id, source_id, source_type, external_id, title, excerpt, content_html,
         url, thumbnail_url, source_name, github, author, published_at, tags,
         metrics, featured, archived, created_at, updated_at,
         content_text, search_tsv
  FROM ranked
  WHERE rn <= v_cap
  ORDER BY published_at DESC, id DESC
  OFFSET (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1)
  LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.content_capped_pages_count(
  p_types text[],
  p_cap int
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cap int;
  v_sources int;
BEGIN
  IF p_cap IS NOT NULL THEN
    v_cap := GREATEST(p_cap, 1);
  ELSE
    SELECT count(*) INTO v_sources
    FROM public.sources s
    WHERE s.enabled AND NOT s.archived AND s.type = ANY(p_types);
    v_cap := GREATEST(3, CEIL(240.0 / GREATEST(v_sources, 1))::int);
  END IF;

  WITH ranked AS (
    SELECT ROW_NUMBER() OVER (
      PARTITION BY c.source_id
      ORDER BY c.published_at DESC, c.id DESC
    ) AS rn
    FROM public.content c
    WHERE c.archived = false
      AND c.source_type = ANY(p_types)
      AND c.source_id IN (
        SELECT s.id FROM public.sources s
        WHERE s.enabled AND NOT s.archived AND s.type = ANY(p_types)
      )
  )
  SELECT count(*)::bigint INTO v_cap FROM ranked WHERE rn <= v_cap;
  RETURN v_cap;
END;
$$;
