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
import { fetchFeedItems } from "@/lib/fetchers/rss";
import { fetchSubredditPosts } from "@/lib/fetchers/reddit";
import { fetchDailyPapers } from "@/lib/fetchers/huggingface";
import { fetchTrendingRepos } from "@/lib/fetchers/trendshift";
import {
  extractGithubSlug,
  fetchRepoData,
  githubOgImageUrl,
} from "@/lib/fetchers/github-repos";
import { fetchImpressions } from "@/lib/fetchers/osp-impressions";
import { computeRating } from "@/lib/fetchers/rating";
import { stripLoneSurrogates, truncateSafe } from "@/lib/strings";
import {
  upsertContentBatch,
  type UpsertContentInput,
} from "@/lib/repositories/content-repo";
import {
  getEnabledSources,
  saveResolutionCache,
  touchSourceMetadata,
} from "@/lib/repositories/source-repo";
import { runDailyScrub } from "@/lib/quality/scrub-service";
import type { ScrubFinding } from "@/lib/quality/scrubber";
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
  /**
   * True when the failure is environmental/configuration (missing token,
   * missing API key) and will not fix itself by retrying. Config errors are
   * recorded but do NOT increment the auto-disable counter — a source must
   * not be switched off for lacking credentials the operator has to add
   * out-of-band (FID-022 sweep finding).
   */
  configError?: boolean;
}

export interface FetchAllResult {
  ranAt: Date;
  totalSources: number;
  succeeded: number;
  failed: number;
  itemsFetched: number;
  outcomes: SourceFetchOutcome[];
  /** Content-quality findings from the daily sweep (FID-2026-0904-018). */
  scrubFindings: ScrubFinding[];
}

function youtubeApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is not configured");
  }
  return apiKey;
}

/**
 * RSS pipeline branch (FID-018): fetch feed → normalize → rate (freshness-
 * driven; engagement terms are 0 for articles) → deterministic-id upsert.
 * Same error-isolation contract as the youtube branch.
 */
async function fetchRssSource(
  source: Source,
  warnings: string[],
): Promise<SourceFetchOutcome> {
  const {
    items: feedItems,
    errors,
    feedTitle,
  } = await fetchFeedItems({
    url: source.url,
    maxItems: source.config.maxItems,
  });
  warnings.push(...errors);

  if (feedItems.length === 0) {
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

  const now = new Date();
  const inputs: UpsertContentInput[] = feedItems.map((item) => ({
    sourceType: "rss" as const,
    externalId: item.externalId,
    sourceId: source.id,
    sourceName: source.name,
    title: item.title,
    excerpt: item.excerpt,
    contentHtml: item.contentHtml,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    author: item.author || feedTitle || source.name,
    publishedAt: item.publishedAt,
    tags: item.tags,
    metrics: {
      views: 0,
      likes: 0,
      comments: 0,
      rating: computeRating({
        views: 0,
        likes: 0,
        comments: 0,
        publishedAt: item.publishedAt,
        now,
      }),
    },
  }));

  const written = await upsertContentBatch(inputs);

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

/**
 * Open-source pipeline branch (FID-2026-0904-009): project-discovery feeds
 * (opensourceprojects.dev) are their OWN category, not an rss sub-flavor.
 * Feed transport is identical to rss, but items are enriched with (a) real
 * impression counts (FID-2026-0904-008) and (b) GitHub repo facts + og-cards
 * (FID-2026-0904-009) — so home /github can rank and render them like
 * trendshift. Writes `opensource` docs.
 */
async function fetchOpenSourceSource(
  source: Source,
  warnings: string[],
): Promise<SourceFetchOutcome> {
  const {
    items: feedItems,
    errors,
    feedTitle,
  } = await fetchFeedItems({
    url: source.url,
    maxItems: source.config.maxItems,
  });
  warnings.push(...errors);

  if (feedItems.length === 0) {
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

  const now = new Date();

  // Impressions (FID-2026-0904-008): robots-allowed post pages carry the real
  // counter the feed never exposes.
  const enriched = await fetchImpressions(
    feedItems.map((item) => item.url),
    { maxPages: 24 },
  );
  warnings.push(...enriched.errors);
  if (enriched.impressions.size > 0) {
    warnings.push(
      `OSP impressions enriched for ${enriched.impressions.size} item(s)`,
    );
  }

  // GitHub facts (FID-2026-0904-009) — slug from the feed's repo link.
  const slugs = feedItems
    .map((item) => {
      const link = item.contentHtml?.match(
        /https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i,
      );
      return link ? extractGithubSlug(link[0]) : null;
    })
    .filter((slug): slug is string => slug !== null);
  const { repos: repoData, errors: ghErrors } = await fetchRepoData(slugs, {
    maxRepos: 30,
  });
  warnings.push(...ghErrors);
  if (repoData.size > 0) {
    warnings.push(`OSP GitHub enrichment applied to ${repoData.size} repo(s)`);
  }

  const inputs: UpsertContentInput[] = feedItems.map((item) => {
    const views = enriched.impressions.get(item.url) ?? 0;
    const link = item.contentHtml?.match(
      /https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i,
    );
    const slug = link ? extractGithubSlug(link[0]) : null;
    const gh = slug ? (repoData.get(slug) ?? null) : null;
    return {
      sourceType: "opensource" as const,
      externalId: item.externalId,
      sourceId: source.id,
      sourceName: source.name,
      github: gh,
      title: item.title,
      excerpt: gh?.description ?? item.excerpt,
      contentHtml: item.contentHtml,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? (gh ? gh.ogImageUrl : null),
      author: item.author || feedTitle || source.name,
      publishedAt: item.publishedAt,
      tags: gh?.topics.length ? gh.topics : item.tags,
      metrics: {
        views,
        likes: 0,
        comments: 0,
        rating: computeRating({
          views,
          likes: 0,
          comments: 0,
          publishedAt: item.publishedAt,
          now,
        }),
      },
    };
  });

  const written = await upsertContentBatch(inputs);

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

/**
 * Reddit pipeline branch (FID-022): subreddit hot.rss through the proven feed
 * parser → normalize → rate (freshness-driven; reddit's feed exposes no
 * engagement numbers) → deterministic-id upsert. Reddit post URLs never reach
 * the client as links — the article reader consumes stored content.
 */
async function fetchRedditSource(
  source: Source,
  warnings: string[],
): Promise<SourceFetchOutcome> {
  const { items, errors, feedTitle } = await fetchSubredditPosts({
    url: source.url,
    maxItems: source.config.maxItems,
  });
  warnings.push(...errors);

  if (items.length === 0) {
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

  const now = new Date();
  const inputs: UpsertContentInput[] = items.map((item) => ({
    sourceType: "reddit" as const,
    externalId: item.externalId,
    sourceId: source.id,
    sourceName: source.name,
    title: item.title,
    excerpt: item.excerpt,
    contentHtml: item.contentHtml,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    author: item.author || feedTitle || source.name,
    publishedAt: item.publishedAt,
    tags: item.tags,
    metrics: {
      views: 0,
      likes: 0,
      comments: 0,
      rating: computeRating({
        views: 0,
        likes: 0,
        comments: 0,
        publishedAt: item.publishedAt,
        now,
      }),
    },
  }));

  const written = await upsertContentBatch(inputs);

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

/**
 * Trendshift pipeline branch (FID-2026-0904-003): trending-repos listing →
 * normalize → rate (views→views, bookmarks→likes — bookmark is Trendshift's
 * real engagement signal) → deterministic-id upsert keyed by `owner/repo`.
 * Stats/tags/mention are stored as reader content — the no-exit law holds.
 */
async function fetchTrendshiftSource(
  source: Source,
  warnings: string[],
): Promise<SourceFetchOutcome> {
  const { repos, errors } = await fetchTrendingRepos({
    url: source.url,
    maxItems: source.config.maxItems,
  });
  warnings.push(...errors);

  if (repos.length === 0) {
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

  const now = new Date();

  // FID-2026-0904-009: cron-time GitHub enrichment (operator architecture
  // call — never per render; unauthenticated GitHub is 60 req/h site-wide).
  const {
    repos: repoData,
    errors: ghErrors,
    rateLimited,
  } = await fetchRepoData(
    repos.map((repo) => repo.slug),
    { maxRepos: 60 },
  );
  warnings.push(...ghErrors);
  if (rateLimited) {
    warnings.push(
      "GitHub rate limit hit — some repos enriched without API data",
    );
  }
  if (repoData.size > 0) {
    warnings.push(`GitHub enrichment applied to ${repoData.size} repo(s)`);
  }

  const inputs: UpsertContentInput[] = repos.map((repo) => {
    const gh = repoData.get(repo.slug.toLowerCase()) ?? null;
    const stats: string[] = [];
    if (repo.views !== null)
      stats.push(`${repo.views.toLocaleString("en")} views`);
    if (repo.bookmarks !== null)
      stats.push(`${repo.bookmarks.toLocaleString("en")} bookmarks`);
    const statLine = stats.length > 0 ? stats.join(" · ") : "trending now";
    const tagsLine =
      repo.tags.length > 0
        ? ` — ${repo.tags.map((t) => `#${t.replace(/ /g, "")}`).join(" ")}`
        : "";
    const mention = repo.mention ? ` · mentioned on ${repo.mention}` : "";
    const body = `${statLine}${tagsLine}${mention}`;
    const publishedAt = repo.dayLabel
      ? new Date(`${repo.dayLabel}T12:00:00Z`)
      : now;
    const safeDate = Number.isNaN(publishedAt.getTime()) ? now : publishedAt;

    // URL correctness fix (probe finding): the listing's sponsor-widget GitHub
    // links once polluted item urls (identity ≠ sponsor link). The slug IS the
    // repo's identity — github.com/{slug} only when the slug is real-world
    // plausible; the trendshift repo page otherwise.
    const url =
      repo.githubUrl &&
      extractGithubSlug(repo.githubUrl) === repo.slug.toLowerCase()
        ? repo.githubUrl
        : repo.trendshiftId
          ? `https://trendshift.io/repositories/${repo.trendshiftId}`
          : "https://trendshift.io";

    return {
      sourceType: "trendshift" as const,
      externalId: repo.slug,
      sourceId: source.id,
      sourceName: source.name,
      github: gh,
      title: repo.slug,
      excerpt: stripLoneSurrogates(
        truncateSafe(gh?.description ?? `${statLine}${tagsLine}`, 280),
      ),
      contentHtml: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
      url,
      thumbnailUrl: githubOgImageUrl(repo.slug),
      author: repo.slug.split("/")[0] ?? repo.slug,
      publishedAt: safeDate,
      tags: gh?.topics.length ? gh.topics : repo.tags,
      metrics: {
        views: repo.views ?? 0,
        likes: repo.bookmarks ?? 0,
        comments: 0,
        rating: computeRating({
          views: repo.views ?? 0,
          likes: repo.bookmarks ?? 0,
          comments: 0,
          publishedAt: safeDate,
          now,
        }),
      },
    };
  });

  const written = await upsertContentBatch(inputs);

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

/**
 * HuggingFace pipeline branch (FID-022): daily papers → normalize → rate
 * (upvotes drive engagement, honestly — they are the community's real signal)
 * → deterministic-id upsert keyed by arXiv id (dedupes across days).
 */
async function fetchHuggingFaceSource(
  source: Source,
  warnings: string[],
): Promise<SourceFetchOutcome> {
  const { papers, errors } = await fetchDailyPapers({
    maxItems: source.config.maxItems,
  });
  warnings.push(...errors);

  if (papers.length === 0) {
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

  const now = new Date();
  const inputs: UpsertContentInput[] = papers.map((paper) => ({
    sourceType: "huggingface" as const,
    externalId: paper.id,
    sourceId: source.id,
    sourceName: source.name,
    title: paper.title,
    excerpt: stripLoneSurrogates(truncateSafe(paper.summary, 280)),
    contentHtml:
      paper.summary.length > paper.title.length + 40
        ? `<p>${paper.summary.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
        : null,
    url: `https://huggingface.co/papers/${paper.id}`,
    thumbnailUrl: null,
    author: paper.authors.slice(0, 4).join(", ") || "HuggingFace Daily Papers",
    publishedAt: paper.publishedAt,
    tags: ["huggingface", "daily-papers"],
    metrics: {
      views: 0,
      likes: paper.upvotes,
      comments: 0,
      rating: computeRating({
        views: 0,
        likes: paper.upvotes,
        comments: 0,
        publishedAt: paper.publishedAt,
        now,
      }),
    },
  }));

  const written = await upsertContentBatch(inputs);

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

async function fetchSourceContent(source: Source): Promise<SourceFetchOutcome> {
  const warnings: string[] = [];

  if (source.type === "rss") {
    return fetchRssSource(source, warnings);
  }

  if (source.type === "reddit") {
    return fetchRedditSource(source, warnings);
  }

  if (source.type === "huggingface") {
    return fetchHuggingFaceSource(source, warnings);
  }

  if (source.type === "trendshift") {
    return fetchTrendshiftSource(source, warnings);
  }

  if (source.type === "opensource") {
    return fetchOpenSourceSource(source, warnings);
  }

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

  // FID-017: fail fast with a precise message when a youtube-typed source
  // holds a non-YouTube URL (classic operator slip: wrong type at create).
  // The generic channel-resolution error made this look like a flaky fetch.
  if (!/youtube\.com|youtu\.be/i.test(source.url)) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      ok: false,
      itemsFetched: 0,
      error: `Source type is "youtube" but the URL is not a YouTube URL (${source.url}) — edit the source and correct its type or URL`,
      warnings,
    };
  }

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
      sourceName: source.name,
      title: video.title,
      excerpt: stripLoneSurrogates(truncateSafe(video.description, 280)),
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
    await saveResolutionCache(source.id, channelId);
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
    const { updateSource } = await import("@/lib/repositories/source-repo");
    await updateSource(source.id, { enabled: false });
  }
}

/**
 * Config-class failure (FID-022): record the error for the operator, but do
 * NOT increment consecutiveErrors — retrying cannot fix a missing token, and
 * auto-disable would silently switch the source off while the operator is
 * still setting credentials up.
 */
async function recordConfigFailure(
  source: Source,
  errorMessage: string,
): Promise<void> {
  await touchSourceMetadata(source.id, {
    lastFetchedAt: new Date(),
    lastError: errorMessage,
  });
}

/**
 * Fetch all enabled sources. Per-source failures are isolated and recorded —
 * the batch always completes, and the returned outcomes are the data.
 */
/**
 * Fetch one source through the full pipeline (FID-016) — exported so admin
 * routes can fetch a freshly created source immediately. Failures are
 * captured into source metadata and returned as outcome data; never thrown.
 */
export async function runFetchForSource(
  source: Source,
): Promise<SourceFetchOutcome> {
  try {
    const outcome = await fetchSourceContent(source);

    if (outcome.ok) {
      await recordSourceSuccess(source, outcome.itemsFetched);
    } else if (outcome.configError) {
      await recordConfigFailure(source, outcome.error ?? "Configuration error");
    } else {
      await recordSourceFailure(source, outcome.error ?? "Unknown failure");
    }

    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSourceFailure(source, message);
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      ok: false,
      itemsFetched: 0,
      error: message,
      warnings: [],
    };
  }
}

export async function runFetchAllSources(): Promise<FetchAllResult> {
  const ranAt = new Date();
  const sources = await getEnabledSources();

  const outcomes: SourceFetchOutcome[] = [];

  for (const source of sources) {
    outcomes.push(await runFetchForSource(source));
  }

  // FID-2026-0904-018: daily content-quality sweep, piggybacked on the
  // fetch cycle. Runs at most once per UTC day (the hourly cron fires 24x —
  // the scrub only needs one slot, the first cycle after UTC midnight).
  let scrubFindings: ScrubFinding[] = [];
  if (new Date().getUTCHours() === 0) {
    try {
      scrubFindings = await runDailyScrub();
    } catch (error) {
      // A failed scrub must never fail the fetch cycle — it's surveillance,
      // not ingestion.
      console.error("[scrub] daily sweep failed:", error);
    }
  }

  return {
    ranAt,
    totalSources: sources.length,
    succeeded: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    itemsFetched: outcomes.reduce((sum, o) => sum + o.itemsFetched, 0),
    outcomes,
    scrubFindings,
  };
}
