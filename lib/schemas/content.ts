/**
 * Domain schemas for the content aggregation system (FID-002).
 *
 * Zod is the single source of truth for document shapes. Firestore returns
 * untyped maps — every read passes through these schemas before leaving the
 * repository layer, so `any` never leaks into routes or components.
 */

import { z } from "zod";

/**
 * Source types (FID-002; "x" removed per FID-2026-0904-004 — X's free API
 * tier was discontinued 2026-02 and no honest free read path exists;
 * "trendshift" added per FID-2026-0904-003; "opensource" added per
 * FID-2026-0904-009 — open-source project discovery is its own category,
 * not an RSS sub-flavor).
 */
export const SOURCE_TYPES = [
  "youtube",
  "rss",
  "reddit",
  "huggingface",
  "trendshift",
  "opensource",
] as const;

export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof sourceTypeSchema>;

const prioritySchema = z.enum(["low", "medium", "high"]);

/**
 * Raw Firestore document shape for `sources/{docId}`.
 * Timestamps arrive as Firestore Timestamps and are converted by the repo
 * before validation; schemas model the post-conversion domain shape.
 */
export const sourceConfigSchema = z.object({
  fetchIntervalMinutes: z.number().int().min(5).max(1440).default(60),
  priority: prioritySchema.default("medium"),
  maxItems: z.number().int().min(1).max(200).default(50),
  tags: z.array(z.string().min(1)).default([]),
});

export const sourceMetadataSchema = z.object({
  lastFetchedAt: z.date().nullable().default(null),
  lastError: z.string().nullable().default(null),
  consecutiveErrors: z.number().int().min(0).default(0),
  totalFetched: z.number().int().min(0).default(0),
});

export const sourceSchema = z.object({
  id: z.string().min(1),
  type: sourceTypeSchema,
  name: z.string().min(1).max(120),
  url: z.string().url(),
  enabled: z.boolean().default(true),
  /** Soft-delete flag (FID-005): archived sources never fetch, docs remain. */
  archived: z.boolean().default(false),
  config: sourceConfigSchema,
  metadata: sourceMetadataSchema,
  /** Cached channel resolution so steady-state fetches cost 0 quota units. */
  resolutionCache: z
    .object({
      channelId: z.string().min(1),
      resolvedAt: z.date(),
    })
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Source = z.infer<typeof sourceSchema>;

/** Content metrics snapshot taken at fetch time. */
export const contentMetricsSchema = z.object({
  views: z.number().int().min(0).default(0),
  likes: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  /** Computed at fetch time, range [0, 1]. FID-003 owns the formula. */
  rating: z.number().min(0).max(1).default(0),
  /** Rating at the previous fetch cycle (FID-2026-0905-002): momentum
   *  baseline. Optional — first sight has none; parse must NOT strip it
   *  (zod strips undeclared keys), or deltas become invisible to TSX. */
  prevRating: z.number().min(0).max(1).optional(),
  /** Rolling momentum baselines (FID-2026-0905-002 self-correct):
   *  per-cycle deltas are decay-noise (rating decays every cycle, so a
   *  week's gain evaporates from prev_rating within one hour). These
   *  baselines are carried on the row and refreshed only when older than
   *  their window (day / week), so deltas measure real movement over real
   *  spans. ISO timestamps mark when each baseline was snapshotted. */
  ratingDayAgo: z.number().min(0).max(1).optional(),
  ratingDayAgoAt: z.string().optional(),
  ratingWeekAgo: z.number().min(0).max(1).optional(),
  ratingWeekAgoAt: z.string().optional(),
});

/**
 * Structured GitHub repo facts (FID-2026-0904-009), denormalized onto content
 * docs at FETCH time (cron — never per render; unauthenticated GitHub allows
 * 60 req/h site-wide, token'd 5,000). Null/absent on non-repo items.
 */
export const githubRepoSchema = z.object({
  /** Canonical lowercase `owner/repo`. */
  slug: z.string().min(1),
  description: z.string().nullable().default(null),
  stars: z.number().int().min(0).default(0),
  forks: z.number().int().min(0).default(0),
  language: z.string().nullable().default(null),
  topics: z.array(z.string().min(1)).default([]),
  license: z.string().nullable().default(null),
  homepage: z.string().nullable().default(null),
  pushedAt: z.string().nullable().default(null),
  /** Official GitHub og-card for the repo (no auth, deterministic). */
  ogImageUrl: z.string().url(),
});

export const contentSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceType: sourceTypeSchema,
  /** Native id at the origin (video id, post id, …). */
  externalId: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().default(""),
  /**
   * Full article body the publisher syndicated in the feed (FID-020),
   * sanitized at fetch time. Optional: youtube docs and pre-FID-020 rss docs
   * lack it (deterministic-id re-fetch backfills). The reader renders this
   * FIRST — before any live scrape of the source page.
   */
  contentHtml: z.string().max(500_000).optional(),
  url: z.string().url(),
  /** Origin thumbnail image, when the source provides one. */
  thumbnailUrl: z.string().url().nullable().default(null),
  /**
   * Denormalized source name (FID-2026-0904-007) — lets cards identify the
   * feed without a per-render source lookup. Null on pre-backfill docs.
   */
  sourceName: z.string().min(1).max(120).nullable().default(null),
  /** GitHub repo facts (FID-2026-0904-009) — trendshift + opensource items. */
  github: githubRepoSchema.nullable().default(null),
  author: z.string().default(""),
  publishedAt: z.date(),
  tags: z.array(z.string().min(1)).default([]),
  metrics: contentMetricsSchema,
  featured: z.boolean().default(false),
  archived: z.boolean().default(false),
  /**
   * Present only when the doc was created via an explicit create path;
   * upserts (merge) intentionally omit it. `updatedAt` + `publishedAt`
   * are the authoritative timestamps for content.
   */
  createdAt: z.date().nullable().default(null),
  updatedAt: z.date(),
});

export type ContentItem = z.infer<typeof contentSchema>;

/**
 * Comments (FID-013). Append-only, soft-archive moderation. Stored with the
 * author's email for accountability; the UI renders only the local-part —
 * never the full address (never expose more identity than the feature needs).
 */
export const commentSchema = z.object({
  id: z.string().min(1),
  /** Content document id the comment belongs to (`youtube_{videoId}`). */
  contentId: z.string().min(1),
  userId: z.string().min(1),
  userEmail: z.string().email(),
  body: z.string().min(1).max(2000),
  /** FID-2026-0904-023 stream B: parent comment for replies (one display
   *  level — a reply to a reply flattens to its ancestor at write time). */
  parentId: z.string().min(1).nullable().default(null),
  archived: z.boolean().default(false),
  createdAt: z.date(),
});

export type Comment = z.infer<typeof commentSchema>;

/**
 * Deterministic content document id — the dedupe strategy (FID-002).
 * One idempotent merge-set per item replaces read-before-write checks.
 */
export function buildContentDocId(
  sourceType: SourceType,
  externalId: string,
): string {
  const safeExternalId = externalId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${sourceType}_${safeExternalId}`;
}
