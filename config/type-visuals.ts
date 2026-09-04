import type { SourceType } from "@/lib/schemas/content";

/**
 * Per-type branded card images (FID-2026-0904-001), operator-provided in
 * public/. Used ONLY as the render-time fallback when a content item carries
 * no origin thumbnail — a real thumbnail always wins. Null falls back to the
 * letter tile (youtube: real API thumbnails essentially always exist;
 * trendshift: operator image added 2026-09-04, wired same day).
 *
 * The exhaustive Record forces an explicit entry whenever a new SourceType is
 * added — a missing type can never silently render the wrong branding.
 */
export const TYPE_FALLBACK_IMAGE: Record<SourceType, string | null> = {
  youtube: null,
  rss: "/rss.jpg",
  reddit: "/reddit.jpg",
  huggingface: "/huggingface.jpg",
  trendshift: "/trendshift.jpg",
  // opensource items carry GitHub og-card thumbnails from enrichment; the
  // letter tile only appears for the rare un-enriched doc.
  opensource: null,
};
