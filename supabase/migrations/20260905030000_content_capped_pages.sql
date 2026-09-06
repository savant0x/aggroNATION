-- FID-2026-0905-007: page-able diversification. content_capped_pages returns
-- the same per-source-capped, enabled-source-filtered chronological pool as
-- content_capped, but OFFSETs whole pages so highlights "Older" walks DEEPER
-- items per source instead of re-showing page 1. Columns enumerated exactly
-- like content_capped (its ranked CTE carries rn; search_tsv is generated and
-- must not leak). Count twin for exact pagination math.
CREATE OR REPLACE FUNCTION public.content_capped_pages(
  p_types text[],
  p_cap int,
  p_limit int,
  p_page int
)
RETURNS SETOF public.content
LANGUAGE sql
STABLE
AS $$
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
  WHERE rn <= GREATEST(p_cap, 1)
  ORDER BY published_at DESC, id DESC
  OFFSET (GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1)
  LIMIT GREATEST(p_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.content_capped_pages_count(
  p_types text[],
  p_cap int
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
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
  SELECT count(*)::bigint FROM ranked WHERE rn <= GREATEST(p_cap, 1);
$$;
