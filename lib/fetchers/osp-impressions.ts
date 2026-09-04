/**
 * OSP impressions scraper (FID-2026-0904-008) — real data acquisition, NO
 * database imports.
 *
 * Scope note (probed 2026-09-04): the `?sort=views` listing is client-
 * rendered and loads from an `/api/` path that robots.txt DISALLOWS — that
 * listing is never fetched. The individual post pages ARE robots-allowed
 * (`Allow: /`), server-rendered, and carry a per-project "Impressions" count.
 * This fetcher enriches feed-acquired OSP items with those real counts.
 *
 * Same partial-failure contract as every fetcher: per-item loss is collected
 * into `errors[]`; only catastrophic input conditions throw.
 */

const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
const USER_AGENT =
  "Mozilla/5.0 (compatible; aggroNATION/1.0; content-aggregator)";

export interface ImpressionsResult {
  /** url -> impressions (only successfully parsed pages). */
  impressions: Map<string, number>;
  errors: string[];
}

/** Only opensourceprojects.dev post URLs are ever fetched by this module. */
function isOspPostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.opensourceprojects.dev" &&
      parsed.pathname.startsWith("/post/")
    );
  } catch {
    return false;
  }
}

/** "Impressions 41" from tag-stripped page text (probed live). */
export function parseImpressions(html: string): number | null {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const match = text.match(/Impressions\s*([\d,]+)/i);
  if (!match) return null;
  const value = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function fetchOne(url: string): Promise<number | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return parseImpressions(await response.text());
}

export async function fetchImpressions(
  urls: string[],
  options: { maxPages?: number } = {},
): Promise<ImpressionsResult> {
  const maxPages = options.maxPages ?? 24;
  const targets = urls.filter((u) => isOspPostUrl(u)).slice(0, maxPages);

  const impressions = new Map<string, number>();
  const errors: string[] = [];

  // Bounded-concurrency worker pool: 4 at a time, per-item isolation.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const url = targets[cursor];
      cursor += 1;
      try {
        const value = await fetchOne(url);
        if (value !== null) {
          impressions.set(url, value);
        } else {
          errors.push(`No Impressions marker on ${url}`);
        }
      } catch (error) {
        errors.push(
          `Failed ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
  );

  return { impressions, errors };
}
