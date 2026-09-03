/**
 * YouTube fetcher (FID-003) — pure data acquisition, NO database imports.
 *
 * Quota-efficient channel resolution (vs the legacy build's 100-unit search):
 * - channel/UC… urls pass through (0 units)
 * - @handle      → channels?forHandle= (1 unit, exact)
 * - /c/, /user/  → channels?forUsername= (1 unit), search as documented last resort
 *
 * Partial-failure contract: API errors for individual videos/batches are
 * collected into `errors[]` — the fetcher never throws for partial data loss,
 * only for "cannot proceed at all" conditions (no key, unresolvable channel,
 * total API failure).
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export type ChannelIdentifier =
  | { kind: "channelId"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "custom"; value: string }
  | { kind: "username"; value: string };

export class YouTubeError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "YouTubeError";
  }
}

export function extractChannelIdentifier(
  url: string,
): ChannelIdentifier | null {
  const trimmed = url.split("?")[0].replace(/\/+$/, "");

  const channel = trimmed.match(/youtube\.com\/channel\/([^/]+)/);
  if (channel) {
    return { kind: "channelId", value: channel[1] };
  }

  const handle = trimmed.match(/youtube\.com\/@([^/]+)/);
  if (handle) {
    return { kind: "handle", value: handle[1] };
  }

  const custom = trimmed.match(/youtube\.com\/c\/([^/]+)/);
  if (custom) {
    return { kind: "custom", value: custom[1] };
  }

  const user = trimmed.match(/youtube\.com\/user\/([^/]+)/);
  if (user) {
    return { kind: "username", value: user[1] };
  }

  return null;
}

interface YouTubeVideoRaw {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelTitle: string;
    tags?: string[];
    thumbnails?: Record<string, { url: string } | undefined>;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date;
  channelTitle: string;
  thumbnailUrl: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
}

export interface FetchChannelResult {
  videos: YouTubeVideo[];
  /** Non-fatal problems encountered during the fetch (partial data loss). */
  errors: string[];
}

async function youtubeGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const search = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetch(
    `${YOUTUBE_API_BASE}${path}?${search.toString()}`,
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new YouTubeError(
      `YouTube API ${path} failed (${response.status}): ${body?.error?.message ?? response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Resolve any supported identifier form to a UC… channel id.
 * `resolutionCache` (from a prior run, stored on the source doc) skips the
 * API entirely when present — steady-state resolution costs 0 units.
 */
export async function resolveToChannelId(
  identifier: ChannelIdentifier,
  apiKey: string,
  resolutionCache?: string,
): Promise<string | null> {
  if (identifier.kind === "channelId") {
    return identifier.value;
  }

  if (resolutionCache) {
    return resolutionCache;
  }

  if (identifier.kind === "handle") {
    const data = await youtubeGet<{
      items?: Array<{ id: string }>;
    }>("/channels", { part: "id", forHandle: `@${identifier.value}` }, apiKey);
    return data.items?.[0]?.id ?? null;
  }

  if (identifier.kind === "username" || identifier.kind === "custom") {
    const data = await youtubeGet<{
      items?: Array<{ id: string }>;
    }>("/channels", { part: "id", forUsername: identifier.value }, apiKey);
    if (data.items?.[0]?.id) {
      return data.items[0].id;
    }
    // Last resort (documented): search endpoint — expensive (100 units) and
    // fuzzy. Only reached for /c/ custom urls that forUsername missed.
    const searchData = await youtubeGet<{
      items?: Array<{ id?: { channelId?: string } }>;
    }>(
      "/search",
      {
        part: "snippet",
        q: identifier.value,
        type: "channel",
        maxResults: "1",
      },
      apiKey,
    );
    return searchData.items?.[0]?.id?.channelId ?? null;
  }

  return null;
}

function parseVideo(raw: YouTubeVideoRaw): YouTubeVideo {
  return {
    videoId: raw.id,
    title: raw.snippet.title,
    description: raw.snippet.description,
    publishedAt: new Date(raw.snippet.publishedAt),
    channelTitle: raw.snippet.channelTitle,
    thumbnailUrl:
      raw.snippet.thumbnails?.high?.url ??
      raw.snippet.thumbnails?.medium?.url ??
      raw.snippet.thumbnails?.default?.url ??
      null,
    viewCount: Number.parseInt(raw.statistics?.viewCount ?? "0", 10) || 0,
    likeCount: Number.parseInt(raw.statistics?.likeCount ?? "0", 10) || 0,
    commentCount: Number.parseInt(raw.statistics?.commentCount ?? "0", 10) || 0,
    tags: raw.snippet.tags?.slice(0, 10) ?? [],
  };
}

export async function fetchChannelVideos(options: {
  apiKey: string;
  channelId: string;
  maxItems: number;
}): Promise<FetchChannelResult> {
  const { apiKey, channelId, maxItems } = options;
  const errors: string[] = [];

  // Step 1: uploads playlist for the channel (1 unit).
  const channelData = await youtubeGet<{
    items?: Array<{
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  }>("/channels", { part: "contentDetails", id: channelId }, apiKey);

  const uploadsPlaylistId =
    channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new YouTubeError(
      `No uploads playlist found for channel ${channelId}`,
    );
  }

  // Step 2: playlist items (1 unit per 50).
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const playlistData = await youtubeGet<{
      items?: Array<{ contentDetails?: { videoId?: string } }>;
      nextPageToken?: string;
    }>(
      "/playlistItems",
      {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: String(Math.min(50, maxItems - videoIds.length)),
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
    );

    for (const item of playlistData.items ?? []) {
      if (item.contentDetails?.videoId) {
        videoIds.push(item.contentDetails.videoId);
      }
    }

    pageToken = playlistData.nextPageToken;
  } while (pageToken && videoIds.length < maxItems);

  if (videoIds.length === 0) {
    return { videos: [], errors };
  }

  // Step 3: video details in batches of 50 (1 unit per batch).
  const videos: YouTubeVideo[] = [];
  for (let offset = 0; offset < videoIds.length; offset += 50) {
    const batch = videoIds.slice(offset, offset + 50);
    try {
      const details = await youtubeGet<{
        items?: YouTubeVideoRaw[];
      }>(
        "/videos",
        { part: "snippet,statistics", id: batch.join(",") },
        apiKey,
      );
      for (const raw of details.items ?? []) {
        videos.push(parseVideo(raw));
      }
    } catch (error) {
      errors.push(
        `Failed to fetch details for ${batch.length} videos: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { videos, errors };
}
