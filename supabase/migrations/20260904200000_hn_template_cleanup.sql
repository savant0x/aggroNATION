-- FID-2026-0904-017: one-time cleanup of aggregator metadata templates
-- stored as article content. hnrss.org items carry a "description" of the
-- shape "Article URL: … Comments URL: … Points: N # Comments: N" — zero
-- article text. The fetcher now rejects these (isMetadataTemplate); this
-- migration purges the legacy rows:
--   - content_html → NULL (absent-key upserts never re-poison it, and the
--     reader falls back to the live scrape of the real linked article)
--   - excerpt → title (the template is strictly worse than the title as a
--     preview; it feeds cards and og:description)
-- Idempotent: the WHERE clause only matches rows still carrying the template.

BEGIN;

UPDATE content
SET content_html = NULL,
    excerpt = left(title, 280),
    updated_at = now()
WHERE content_html LIKE '%Article URL:%Comments URL:%Points:%';

COMMIT;
