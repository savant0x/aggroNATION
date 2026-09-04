/**
 * RSS/Atom fetcher (FID-018) — same contract as the YouTube fetcher:
 * per-item data loss is collected into `errors[]` and the fetcher never
 * throws for partial loss, only for "cannot proceed at all" conditions
 * (unreachable host, unparseable XML).
 *
 * Handles RSS 2.0 (rss.channel.item) and Atom (feed.entry). Identity is
 * guid, falling back to link (Atom has no guid) — items with neither are
 * skipped with a reason rather than guessed.
 */

import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";

export interface NormalizedFeedItem {
  externalId: string;
  title: string;
  excerpt: string;
  /**
   * Full body the publisher syndicated (FID-020), sanitized once at fetch
   * time so the DB never stores raw third-party HTML. Null when the item
   * carries no meaningful content beyond the title.
   */
  contentHtml: string | null;
  url: string;
  thumbnailUrl: string | null;
  author: string;
  publishedAt: Date;
  tags: string[];
}

/**
 * Sanitizer for feed-provided content — same contract as the article
 * reader's scraper allowlist (no anchors survive, no script/iframe content).
 */
const CONTENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "sub",
    "sup",
    "figure",
    "figcaption",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "data"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  nonTextTags: [
    "script",
    "style",
    "textarea",
    "noscript",
    "option",
    "iframe",
    "svg",
    "form",
    "button",
    "select",
  ],
};

/**
 * Publisher quirks, contained in one place (FID-020). arXiv prefixes every
 * description with `arXiv:<id>v<n> Announce Type: <kind>` — metadata noise,
 * not article content.
 */
function stripPublisherBoilerplate(text: string): string {
  return text.replace(/^\s*arXiv:\S+\s+Announce Type:\s*\S+\s*/i, "").trim();
}

const FULL_CONTENT_MAX = 500_000;

export interface FeedFetchResult {
  items: NormalizedFeedItem[];
  errors: string[];
  feedTitle: string | null;
}

const FETCH_TIMEOUT_MS = 30_000;
const EXCERPT_MAX = 280;

/** Transient host errors worth retrying (hnrss & friends are flaky). */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_500;

/**
 * Browser-like UA — many feeds (and CDNs) 403 or stall bare-node agents.
 */
const REQUEST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 aggroNATION/0.1",
  Accept:
    "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
};

/** Strip HTML tags and collapse whitespace — excerpts are plain text only. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sliceExcerpt(text: string): string {
  return text.length > EXCERPT_MAX
    ? `${text.slice(0, EXCERPT_MAX - 1)}…`
    : text;
}

/** First <img src="…"> in an HTML blob, if any. */
function firstImageInHtml(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function parseDate(raw: unknown, fallback: Date): Date {
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  // Honest fallback: some feeds omit dates entirely. Freshness decays from
  // fetch time (documented limitation — FID-018).
  return fallback;
}

interface RawEntry {
  title?: string | { "#text"?: string };
  link?:
    | string
    | { "@_href"?: string; "#text"?: string }
    | Array<{ "@_href"?: string }>;
  guid?: string | { "#text"?: string };
  description?: string | { "#text"?: string };
  "content:encoded"?: string | { "#text"?: string };
  summary?: string | { "#text"?: string };
  content?: string | { "#text"?: string };
  author?: string | { name?: string };
  "dc:creator"?: string;
  pubDate?: string;
  "dc:date"?: string;
  published?: string;
  updated?: string;
  category?:
    | string
    | Array<string | { "#text"?: string }>
    | { "#text"?: string };
  "media:thumbnail"?: { "@_url"?: string } | Array<{ "@_url"?: string }>;
  enclosure?:
    | { "@_url"?: string; "@_type"?: string }
    | Array<{ "@_url"?: string; "@_type"?: string }>;
}

function textOf(value: RawEntry["title"]): string | undefined {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    typeof value["#text"] === "string"
  ) {
    return value["#text"];
  }
  return undefined;
}

/**
 * Body fields can carry attributes — reddit's Atom emits
 * `<content type="html">…</content>`, which fast-xml-parser shapes as
 * `{ "@_type": "html", "#text": "…" }`, not a string (FID-022 finding).
 * Normalize both shapes to plain text before any string ops.
 */
function bodyTextOf(value: string | { "#text"?: string } | undefined): string {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    typeof value["#text"] === "string"
  ) {
    return value["#text"];
  }
  return "";
}

function linkOf(entry: RawEntry): string | undefined {
  const link = entry.link;
  if (typeof link === "string" && link.length > 0) return link;
  if (Array.isArray(link)) {
    const first = link.find((l) => typeof l["@_href"] === "string");
    if (first?.["@_href"]) return first["@_href"];
  }
  if (link && typeof link === "object" && !Array.isArray(link)) {
    if (typeof link["@_href"] === "string") return link["@_href"];
    if (typeof (link as { "#text"?: string })["#text"] === "string") {
      return (link as { "#text": string })["#text"];
    }
  }
  return undefined;
}

function categoriesOf(entry: RawEntry): string[] {
  const raw = entry.category;
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .map((c) => (typeof c === "string" ? c : c?.["#text"]))
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .slice(0, 8);
}

function normalizeEntry(
  entry: RawEntry,
  feedTitle: string,
  now: Date,
): { item: NormalizedFeedItem } | { error: string } {
  const title = textOf(entry.title)?.trim() || "Untitled";
  const link = linkOf(entry);
  const guidRaw =
    textOf(entry.guid) ??
    (typeof entry.guid === "string" ? entry.guid : undefined);
  const externalId = guidRaw || link;

  if (!externalId) {
    return { error: `Skipped "${title}" — no guid or link to identify it` };
  }
  const htmlBody =
    bodyTextOf(entry["content:encoded"]) ||
    bodyTextOf(entry.content) ||
    bodyTextOf(entry.description) ||
    bodyTextOf(entry.summary);
  const cleanedBody = stripPublisherBoilerplate(stripHtml(htmlBody));
  const plain = cleanedBody;
  const author =
    entry["dc:creator"] ??
    (typeof entry.author === "string" ? entry.author : entry.author?.name) ??
    feedTitle;

  // FID-020: keep the FULL feed-provided body, sanitized once at fetch time.
  // A 280-char excerpt is a preview, not the article. Skip storing content
  // that adds nothing beyond the title (e.g. link-only feeds).
  const fullPlain = stripPublisherBoilerplate(stripHtml(htmlBody));
  const contentHtml =
    fullPlain.length > title.length + 40
      ? sanitizeHtml(htmlBody, CONTENT_SANITIZE_OPTIONS).slice(
          0,
          FULL_CONTENT_MAX,
        )
      : null;

  const mediaThumb = Array.isArray(entry["media:thumbnail"])
    ? entry["media:thumbnail"][0]?.["@_url"]
    : entry["media:thumbnail"]?.["@_url"];
  const enclosures = Array.isArray(entry.enclosure)
    ? entry.enclosure
    : entry.enclosure
      ? [entry.enclosure]
      : [];
  const imageEnclosure = enclosures.find((e) =>
    e["@_type"]?.startsWith("image/"),
  )?.["@_url"];

  const publishedAt = parseDate(
    entry.pubDate ?? entry["dc:date"] ?? entry.published ?? entry.updated,
    now,
  );

  return {
    item: {
      externalId,
      title,
      excerpt: sliceExcerpt(plain || title),
      contentHtml,
      url: link ?? externalId,
      thumbnailUrl: mediaThumb ?? imageEnclosure ?? firstImageInHtml(htmlBody),
      author,
      publishedAt,
      tags: categoriesOf(entry),
    },
  };
}

export async function fetchFeedItems(options: {
  url: string;
  maxItems: number;
}): Promise<FeedFetchResult> {
  const { url, maxItems } = options;
  const errors: string[] = [];

  let response: Response | null = null;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        response = res;
        break;
      }
      lastError = new Error(
        `Feed request failed: HTTP ${res.status} for ${url}`,
      );
      if (!RETRYABLE_STATUS.has(res.status)) {
        throw lastError;
      }
    } catch (error) {
      // Non-retryable status already thrown; network/timeout errors retry.
      if (
        error instanceof Error &&
        error.message.startsWith("Feed request failed: HTTP") &&
        !RETRYABLE_STATUS.has(Number(error.message.match(/HTTP (\d{3})/)?.[1]))
      ) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * attempt),
      );
    }
  }

  if (!response) {
    throw (
      lastError ??
      new Error(`Feed request failed after ${MAX_ATTEMPTS} attempts for ${url}`)
    );
  }
  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    // fast-xml-parser numeric-coerces element text by default (Number()
    // even parses hex: "0xbadcafebee" → 134004633582). That silently turns
    // valid text — e.g. a Hacker News username like 0xbadcafebee — into a
    // number, which then fails the string author schema and aborts the whole
    // source's batch. Every consumer here type-guards string/object shapes,
    // so keeping text as text matches the declared RawEntry types exactly
    // (FID-2026-0904-010 live-walkthrough finding).
    parseTagValue: false,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;

  // RSS 2.0 → rss.channel; Atom → feed. Either may be an array under
  // pathological feeds; normalize to objects.
  const rss = parsed.rss as
    | { channel?: RawEntry & { item?: RawEntry | RawEntry[]; title?: string } }
    | undefined;
  const atom = parsed.feed as
    | (RawEntry & { title?: string; entry?: RawEntry | RawEntry[] })
    | undefined;

  let entries: RawEntry[];
  let feedTitle: string;

  if (rss?.channel) {
    feedTitle = textOf(rss.channel.title) ?? "Unknown feed";
    const rawItems = rss.channel.item;
    entries = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  } else if (atom) {
    feedTitle = textOf(atom.title) ?? "Unknown feed";
    const rawEntries = atom.entry;
    entries = Array.isArray(rawEntries)
      ? rawEntries
      : rawEntries
        ? [rawEntries]
        : [];
  } else {
    throw new Error(
      `Unrecognized feed format at ${url} — neither RSS nor Atom root found`,
    );
  }

  const now = new Date();
  const items: NormalizedFeedItem[] = [];

  for (const entry of entries.slice(0, maxItems)) {
    const result = normalizeEntry(entry, feedTitle, now);
    if ("error" in result) {
      errors.push(result.error);
    } else {
      items.push(result.item);
    }
  }

  return { items, errors, feedTitle };
}
