/**
 * Fetch service (FID-003) — the ONE orchestrator for content ingestion.
 *
 * The legacy build duplicated this logic in lib/cron/index.ts AND
 * app/api/cron/fetch/route.ts. Both entry points now delegate here (Law 13).
 *
 * Per-source failure isolation: one broken source never aborts the batch.
 */

import "server-only";

import {
  extractChannelIdentifier,
  fetchChannelVideos,
  resolveToChannelId,
} from "@/lib/fetchers/youtube";
import { computeRating } from "@/lib/fetchers/rating";
import {
  upsertContentBatch,
  type UpsertContentInput,
} from "@/lib/repositories/content-repo";
import {
  getEnabledSources,
  touchSourceMetadata,
} from "@/lib/repositories/source-repo";
import type { Source } from "@/lib/schemas/content";

/** Consecutive failures after which a source is auto-disabled. */
const AUTO_DISABLE_THRESHOLD = 5;

export interface SourceFetchOutcome {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  ok: boolean;
  itemsFetched: number;
  error: string | null;
  warnings: string[];
}

export interface FetchAllResult {
  ranAt: Date;
  totalSources: number;
  succeeded: number;
  failed: number;
  itemsFetched: number;
  outcomes: SourceFetchOutcome[];
}

function youtubeApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is not configured");
  }
  return apiKey;
}

async function fetchSourceContent(source: Source): Promise<SourceFetchOutcome> {
  const warnings: string[] = [];

  if (source.type !== "youtube") {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      ok: false,
      itemsFetched: 0,
      error: `Fetcher for source type "${source.type}" is not implemented yet`,
      warnings,
    };
  }

  const apiKey = youtubeApiKey();

  const identifier = extractChannelIdentifier(source.url);
  if (!identifier) {
    throw new Error(`Unrecognized YouTube URL format: ${source.url}`);
  }
  const resolutionCache = source.resolutionCache?.channelId;

  const channelId = await resolveToChannelId(
    identifier,
    apiKey,
    resolutionCache,
  );
  if (!channelId) {
    throw new Error(`Could not resolve channel id for ${source.url}`);
  }

  const { videos, errors } = await fetchChannelVideos({
    apiKey,
    channelId,
    maxItems: source.config.maxItems,
  });
  warnings.push(...errors);

  if (videos.length === 0) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      ok: true,
      itemsFetched: 0,
      error: null,
      warnings,
    };
  }

  const items: UpsertContentInput[] = videos.map((video) => {
    const rating = computeRating({
      views: video.viewCount,
      likes: video.likeCount,
      comments: video.commentCount,
      publishedAt: video.publishedAt,
    });

    return {
      sourceType: "youtube" as const,
      externalId: video.videoId,
      sourceId: source.id,
      title: video.title,
      excerpt: video.description.slice(0, 280),
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      thumbnailUrl: video.thumbnailUrl,
      author: video.channelTitle,
      publishedAt: video.publishedAt,
      tags: video.tags,
      metrics: {
        views: video.viewCount,
        likes: video.likeCount,
        comments: video.commentCount,
        rating,
      },
    };
  });

  const written = await upsertContentBatch(items);

  if (channelId !== resolutionCache) {
    // Persist resolution so steady-state runs cost zero resolution quota.
    await touchSourceMetadata(source.id, {});
    await persistResolutionCache(source.id, channelId);
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    ok: true,
    itemsFetched: written,
    error: null,
    warnings,
  };
}

async function persistResolutionCache(
  sourceId: string,
  channelId: string,
): Promise<void> {
  const { adminDb } = await import("@/lib/firebase/admin");
  await adminDb
    .collection("sources")
    .doc(sourceId)
    .set(
      {
        resolutionCache: { channelId, resolvedAt: new Date() },
        updatedAt: new Date(),
      },
      { merge: true },
    );
}

async function recordSourceSuccess(
  source: Source,
  itemsFetched: number,
): Promise<void> {
  const currentTotal = source.metadata.totalFetched;
  await touchSourceMetadata(source.id, {
    lastFetchedAt: new Date(),
    lastError: null,
    consecutiveErrors: 0,
    totalFetched: currentTotal + itemsFetched,
  });
}

async function recordSourceFailure(
  source: Source,
  errorMessage: string,
): Promise<void> {
  const consecutive = source.metadata.consecutiveErrors + 1;
  const disable = consecutive >= AUTO_DISABLE_THRESHOLD;

  await touchSourceMetadata(source.id, {
    lastFetchedAt: new Date(),
    lastError: errorMessage,
    consecutiveErrors: consecutive,
  });

  if (disable) {
    await touchSourceMetadata(source.id, {});
    const { updateSource } = await import("@/lib/repositories/source-repo");
    await updateSource(source.id, { enabled: false });
  }
}

/**
 * Fetch all enabled sources. Per-source failures are isolated and recorded —
 * the batch always completes, and the returned outcomes are the data.
 */
export async function runFetchAllSources(): Promise<FetchAllResult> {
  const ranAt = new Date();
  const sources = await getEnabledSources();

  const outcomes: SourceFetchOutcome[] = [];

  for (const source of sources) {
    try {
      const outcome = await fetchSourceContent(source);
      outcomes.push(outcome);

      if (outcome.ok) {
        await recordSourceSuccess(source, outcome.itemsFetched);
      } else {
        await recordSourceFailure(source, outcome.error ?? "Unknown failure");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.type,
        ok: false,
        itemsFetched: 0,
        error: message,
        warnings: [],
      });
      await recordSourceFailure(source, message);
    }
  }

  return {
    ranAt,
    totalSources: sources.length,
    succeeded: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    itemsFetched: outcomes.reduce((sum, o) => sum + o.itemsFetched, 0),
    outcomes,
  };
}
