/**
 * Reddit fetcher (FID-022) — real data acquisition, NO database imports.
 *
 * Transport decision (probed live 2026-09-04): reddit's official per-subreddit
 * Atom feed (`https://www.reddit.com/r/<sub>/hot.rss`) is the supported,
 * documented, block-free path. The JSON endpoints (.json, api.reddit.com,
 * old.reddit.com) 403/HTML-block datacenter ranges regardless of UA — so the
 * fetcher validates the URL is a subreddit and delegates parsing to the proven
 * FID-018 feed parser. One parser, one sanitizer, one retry policy.
 *
 * Same partial-failure contract as every fetcher: per-item loss is collected
 * into `errors[]`; only "cannot proceed at all" conditions throw.
 */

import { fetchFeedItems } from "@/lib/fetchers/rss";

export class RedditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedditError";
  }
}

/**
 * Accept the subreddit forms an operator will actually paste:
 * https://www.reddit.com/r/<sub>/[…], old.reddit variants, and bare
 * reddit.com/r/<sub>. Returns the subreddit name or null.
 */
export function extractSubreddit(url: string): string | null {
  const match = url.match(/(?:^|\.|^\/\/)reddit\.com\/r\/([A-Za-z0-9_]+)/i);
  return match ? match[1] : null;
}

export async function fetchSubredditPosts(options: {
  url: string;
  maxItems: number;
}): Promise<{
  items: Awaited<ReturnType<typeof fetchFeedItems>>["items"];
  errors: string[];
  feedTitle: string;
}> {
  const { url, maxItems } = options;

  const subreddit = extractSubreddit(url);
  if (!subreddit) {
    throw new RedditError(
      `Source type is "reddit" but the URL is not a subreddit URL (${url}) — edit the source and correct its type or URL`,
    );
  }

  // Reddit ignores unknown query params on .rss; keep the URL canonical.
  const feedUrl = `https://www.reddit.com/r/${subreddit}/hot.rss`;

  const result = await fetchFeedItems({ url: feedUrl, maxItems });

  return {
    items: result.items,
    errors: result.errors,
    feedTitle: result.feedTitle ?? `r/${subreddit}`,
  };
}
