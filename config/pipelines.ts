import { SOURCE_TYPES, type SourceType } from "@/lib/schemas/content";

/**
 * Single source of truth for per-source-type copy (FID-2026-0904-021).
 * Replaces the three hand-maintained parallel maps (About PIPELINES,
 * listing TYPE_LABELS/TYPE_TAGLINES/MERGED_META) that caused the
 * added-a-type-forgot-a-surface bug class (empty-H1, X-still-live).
 *
 * A new SourceType cannot ship without declaring all four copy fields here:
 * the module-load assertion below fails the build on drift.
 */

export interface PipelineInfo {
  /** Display name — nav, listing h1, About pipeline rows. */
  label: string;
  /** Listing-page tagline (lowercase continuation: "… — {tagline}."). */
  tagline: string;
  /** About-page pipeline description. */
  detail: string;
  /** Listing-page empty-state call to action. */
  emptyDetail: string;
}

export const PIPELINES: Record<SourceType, PipelineInfo> = {
  youtube: {
    label: "YouTube",
    tagline: "the most recent AI content from curated YouTube channels",
    detail:
      "Curated channels via the YouTube Data API — videos play on-site, never off-site.",
    emptyDetail:
      "Add YouTube channels in the admin dashboard — they're fetched immediately.",
  },
  rss: {
    label: "RSS",
    tagline: "the latest articles from curated RSS feeds",
    detail:
      "Feed parsing with the publisher's own full-text body rendered in the in-site reader.",
    emptyDetail:
      "Add RSS feeds in the admin dashboard — they're fetched immediately.",
  },
  reddit: {
    label: "Reddit",
    tagline: "the hottest posts from curated subreddits",
    detail:
      "Subreddit hot posts via reddit's official feeds, read on-site with no exits.",
    emptyDetail:
      "Add subreddit sources in the admin dashboard — they're fetched immediately via reddit's official feeds.",
  },
  huggingface: {
    label: "HuggingFace",
    tagline: "today's curated AI papers from HuggingFace Daily",
    detail: "Daily Papers with community upvotes feeding the ranking.",
    emptyDetail:
      "Add a HuggingFace source (https://huggingface.co/papers) in the admin dashboard — daily papers fetch immediately.",
  },
  trendshift: {
    label: "Trendshift",
    tagline: "the trending open-source repos from Trendshift",
    detail:
      "Trending open-source repos from trendshift.io, enriched with live GitHub repo cards. Surfaced together with discoveries in the GitHub section.",
    emptyDetail:
      "Add a Trendshift source (https://trendshift.io/?sort=views) in the admin dashboard — trending repos fetch immediately.",
  },
  opensource: {
    label: "Open Source Projects",
    tagline:
      "the newest open-source project discoveries from Open Source Projects",
    detail:
      "Newly-discovered projects from opensourceprojects.dev, enriched with GitHub repo cards. Surfaced together with trendshift in the GitHub section.",
    emptyDetail:
      "Add an Open Source Projects source (https://www.opensourceprojects.dev/rss) in the admin dashboard — project discoveries fetch immediately.",
  },
};

/** Merged categories (FID-2026-0904-009): URL segment → combined view meta. */
export interface MergedCategory {
  label: string;
  tagline: string;
  sourceTypes: SourceType[];
}

export const MERGED: Record<string, MergedCategory> = {
  github: {
    label: "GitHub",
    tagline:
      "the trending and newly-discovered open-source repositories from Trendshift and Open Source Projects",
    sourceTypes: ["trendshift", "opensource"],
  },
};

// Source-of-truth check: build fails on drift between the schema's type
// union and the copy catalog (the exact bug class this file exists to kill).
const CONFIGURED_TYPES = Object.keys(PIPELINES) as SourceType[];
const MISSING = SOURCE_TYPES.filter((type) => !PIPELINES[type]);
const EXTRA = CONFIGURED_TYPES.filter((type) => !SOURCE_TYPES.includes(type));
if (MISSING.length > 0 || EXTRA.length > 0) {
  throw new Error(
    `config/pipelines.ts is out of sync with SOURCE_TYPES — missing: [${MISSING.join(", ")}], extra: [${EXTRA.join(", ")}]. Every source type needs label, tagline, detail, and emptyDetail.`,
  );
}
