/**
 * Trendshift fetcher (FID-2026-0904-003) — real data acquisition, NO database
 * imports.
 *
 * Transport decision (probed live 2026-09-04): trendshift.io publishes no
 * RSS/Atom feed (all conventional paths 404, no <link rel=alternate>) and its
 * /api/ is disallowed by robots.txt (respected — never probed). The listing
 * pages ARE server-rendered and robots-allowed (`Allow: /`), so the honest
 * path is parsing the listing HTML.
 *
 * Parser policy: anchor on document STRUCTURE (href shapes, link text), never
 * CSS class names — a site redesign degrades into per-item errors, never
 * wrong data. Main-list entries are anchors to /repositories/{id} whose text
 * is exactly `owner/repo`; sidebar/carousel/sponsor anchors carry svg/img
 * content and are excluded structurally.
 *
 * Same partial-failure contract as every fetcher: per-item loss is collected
 * into `errors[]`; only "cannot proceed at all" conditions throw.
 */

const FETCH_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_500;
const USER_AGENT =
  "Mozilla/5.0 (compatible; aggroNATION/1.0; content-aggregator)";

export class TrendshiftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrendshiftError";
  }
}

/** Canonicalize any trendshift.io URL to its trending listing. */
export function canonicalizeTrendshiftUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "trendshift.io") return null;
    // robots.txt disallows /api/ — refuse to fetch such URLs, ever.
    if (parsed.pathname.startsWith("/api")) return null;
    const sort = parsed.searchParams.get("sort") ?? "views";
    return `https://trendshift.io/?sort=${encodeURIComponent(sort)}`;
  } catch {
    return null;
  }
}

export interface TrendshiftRepo {
  /** `owner/repo` — deterministic identity (dedupes across runs). */
  slug: string;
  /** Trendshift repository numeric id, when the anchor exposes it. */
  trendshiftId: string | null;
  githubUrl: string | null;
  views: number | null;
  bookmarks: number | null;
  tags: string[];
  /** Mention handle text when present (e.g. "r/devops"). */
  mention: string | null;
  /** Raw day label parsed from the row, when present (e.g. "2026-09-03"). */
  dayLabel: string | null;
}

export interface FetchTrendshiftResult {
  repos: TrendshiftRepo[];
  errors: string[];
}

interface RowAnchor {
  trendshiftId: string;
  /** Anchor text — must be exactly `owner/repo` to count. */
  slug: string;
  /** Index of the anchor open tag in the document. */
  start: number;
}

/**
 * Main-list anchors: <a href="/repositories/{id}">owner/repo</a> with no
 * svg/img inside (excludes the mobile carousel and sponsor widgets, whose
 * anchors embed icons).
 */
function findRowAnchors(html: string): RowAnchor[] {
  const anchors: RowAnchor[] = [];
  const pattern =
    /<a\b[^>]*href="\/repositories\/(\d+)"[^>]*>((?:(?!<\/a>).)*)<\/a>/g;
  const anchorMatches = Array.from(html.matchAll(pattern));
  for (const match of anchorMatches) {
    const inner = match[2];
    if (/<svg|<img/i.test(inner)) continue;
    const text = decodeHtml(inner.replace(/<[^>]+>/g, " ")).trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text)) continue;
    anchors.push({ trendshiftId: match[1], slug: text, start: match.index });
  }
  // Document order, first occurrence wins (same repo can repeat in widgets).
  const seen = new Set<string>();
  const unique: RowAnchor[] = [];
  for (const anchor of anchors) {
    if (!seen.has(anchor.slug)) {
      seen.add(anchor.slug);
      unique.push(anchor);
    }
  }
  return unique;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/** Row window until the next main-list anchor (or end-of-document). */
function rowWindow(html: string, anchors: RowAnchor[], index: number): string {
  const start = anchors[index].start;
  const end =
    index + 1 < anchors.length ? anchors[index + 1].start : html.length;
  return html.slice(start, end);
}

function scaledNumber(raw: string): number {
  const lower = raw.toLowerCase();
  const multiplier = lower.endsWith("k")
    ? 1_000
    : lower.endsWith("m")
      ? 1_000_000
      : 1;
  const value = Number.parseFloat(lower.replace(/[km]$/, "").replace(/,/g, ""));
  return Number.isFinite(value) ? Math.round(value * multiplier) : Number.NaN;
}

/**
 * Parse the row's two counts (views, bookmarks) — they appear as standalone
 * text numbers shortly after the repo slug, in that order (probed live:
 * "owner/repo … <views> <bookmarks> #tag …"). Date tokens (YYYY-MM-DD) and
 * bare years are excluded; anything unparseable stays null (honest absence).
 */
function parseRowCounts(
  window: string,
  slug: string,
): { views: number | null; bookmarks: number | null } {
  const textStart = window.indexOf(slug);
  const text = decodeHtml(
    window
      .slice(textStart === -1 ? 0 : textStart + slug.length)
      .replace(/<[^>]+>/g, " "),
  );

  const numbers: number[] = [];
  const matches = Array.from(text.matchAll(/\b([\d.,]+[kKmM]?)\b/g));
  for (const match of matches) {
    const token = match[1];
    // Skip years and date fragments — the row carries a YYYY-MM-DD label and
    // the tokens around it are not engagement counts.
    const at = match.index ?? 0;
    const context = text.slice(Math.max(0, at - 1), at + token.length + 1);
    if (/\d-/.test(context) || /-\d/.test(context)) continue;
    const value = scaledNumber(token);
    if (Number.isFinite(value) && value < 100_000_000) numbers.push(value);
    if (numbers.length === 2) break;
  }

  return {
    views: numbers[0] ?? null,
    bookmarks: numbers[1] ?? null,
  };
}

function collectTags(window: string): string[] {
  const text = decodeHtml(window.replace(/<[^>]+>/g, " "));
  const tags = new Set<string>();
  const matches = Array.from(
    text.matchAll(/#([A-Za-z0-9][A-Za-z0-9 _-]{0,38})/g),
  );
  for (const match of matches) {
    const tag = match[1].trim().replace(/\s+/g, " ");
    if (tag.length >= 1 && tag.length <= 40) tags.add(tag);
  }
  return Array.from(tags).slice(0, 8);
}

function findMention(window: string): string | null {
  const reddit = window.match(
    /https?:\/\/(?:www\.)?reddit\.com\/r\/([A-Za-z0-9_]+)/i,
  );
  if (reddit) return `r/${reddit[1]}`;
  const x = window.match(
    /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i,
  );
  return x ? `@${x[1]}` : null;
}

function findGithubUrl(window: string): string | null {
  const match = window.match(
    /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i,
  );
  if (!match) return null;
  return `https://github.com/${match[1]}/${match[2].replace(/\?.*$/, "")}`;
}

/** Parse the row's raw day label ("2026-09-03" style) when present. */
function findDayLabel(window: string): string | null {
  const text = decodeHtml(window.replace(/<[^>]+>/g, " "));
  const match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return match ? match[0] : null;
}

async function fetchListing(url: string): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      throw new TrendshiftError(
        `Trendshift request failed after ${MAX_ATTEMPTS} attempts: ${lastError.message}`,
      );
    }

    if (response.ok) {
      return await response.text();
    }

    lastError = new TrendshiftError(
      `Trendshift listing failed (${response.status}): ${response.statusText}`,
    );
    if (!RETRYABLE_STATUS.has(response.status)) throw lastError;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw lastError ?? new TrendshiftError("Trendshift request failed");
}

export async function fetchTrendingRepos(options: {
  url: string;
  maxItems: number;
}): Promise<FetchTrendshiftResult> {
  const { maxItems } = options;
  const errors: string[] = [];

  const listingUrl = canonicalizeTrendshiftUrl(options.url);
  if (!listingUrl) {
    throw new TrendshiftError(
      `Source type is "trendshift" but the URL is not a trendshift.io listing (${options.url}) — use https://trendshift.io/?sort=views`,
    );
  }

  const html = await fetchListing(listingUrl);
  const anchors = findRowAnchors(html);

  if (anchors.length === 0) {
    // A listing page with zero parseable rows means the page structure
    // changed — fail loudly rather than pretend the source is healthy.
    throw new TrendshiftError(
      "Trendshift listing parsed to zero entries — the page structure likely changed; the parser needs review (nothing is faked)",
    );
  }

  const repos: TrendshiftRepo[] = [];
  const seenSlugs = new Set<string>();
  for (let i = 0; i < anchors.length && repos.length < maxItems; i++) {
    const anchor = anchors[i];
    try {
      const window = rowWindow(html, anchors, i);
      const githubUrl = findGithubUrl(window);
      // Identity preference: the anchor text IS the github owner/repo slug
      // (probed live); a github link found in the row window may belong to
      // adjacent widgets, so it refines the URL, never overrides identity.
      const githubSlug =
        githubUrl !== null
          ? githubUrl
              .replace("https://github.com/", "")
              .split("?")[0]
              .replace(/\/+$/, "")
          : null;
      const slug =
        githubSlug !== null &&
        githubSlug.toLowerCase() === anchor.slug.toLowerCase()
          ? anchor.slug
          : anchor.slug;
      if (seenSlugs.has(slug.toLowerCase())) continue;
      seenSlugs.add(slug.toLowerCase());
      const counts = parseRowCounts(window, slug);

      repos.push({
        slug,
        trendshiftId: anchor.trendshiftId,
        githubUrl,
        views: counts.views,
        bookmarks: counts.bookmarks,
        tags: collectTags(window),
        mention: findMention(window),
        dayLabel: findDayLabel(window),
      });
    } catch (error) {
      errors.push(
        `Skipped trendshift row ${anchor.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { repos, errors };
}
