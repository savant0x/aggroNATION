/**
 * Domain schemas for the content aggregation system (FID-002).
 *
 * Zod is the single source of truth for document shapes. Firestore returns
 * untyped maps — every read passes through these schemas before leaving the
 * repository layer, so `any` never leaks into routes or components.
 */

import { z } from "zod";

export const SOURCE_TYPES = ["youtube", "rss", "reddit", "x"] as const;

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
});

export const contentSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceType: sourceTypeSchema,
  /** Native id at the origin (video id, post id, …). */
  externalId: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().default(""),
  url: z.string().url(),
  /** Origin thumbnail image, when the source provides one. */
  thumbnailUrl: z.string().url().nullable().default(null),
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
