/**
 * Article fetcher (FID-019) — retrieves an RSS item's source page, extracts
 * the main content region, and sanitizes it for on-site rendering.
 *
 * Security contract: third-party HTML is NEVER rendered raw. Everything
 * passes through sanitize-html with an allowlist:
 *  - no <a> survives (unwrapped to its text) → zero off-site navigation
 *    paths inside the reader (no-exit law, FID-011)
 *  - script/style/iframe/svg content is discarded entirely (nonTextTags)
 *  - img src restricted to http(s) — no javascript: URLs can survive
 *
 * Honesty contract (Law 5): many feeds link to JS-only pages whose static
 * HTML carries almost no article text. When extraction yields little text
 * we say so instead of rendering an empty-looking page — the caller gets
 * `sufficient` = false and shows the excerpt + an honest note.
 */

import sanitizeHtml from "sanitize-html";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_BYTES = 2_000_000;

const REQUEST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 aggroNATION/0.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface ArticleFetchResult {
  /** Sanitized, safe-to-render HTML of the article body. */
  html: string;
  /** Whether meaningful article text was extracted. */
  sufficient: boolean;
  /** Plain-text length of the extracted body (before sanitizing). */
  textLength: number;
  /** Page <title> from the source document, when present. */
  sourceTitle: string | null;
}

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
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
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  // Anchors are NOT in the allowlist → sanitize-html unwraps them, keeping
  // their text but removing the tag (and any href). No off-site exits.
  allowedAttributes: {
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "data"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  // Content of these tags is discarded entirely, not just the tags.
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
  transformTags: {
    // Navigation chrome rendered as headings would be noise; demote them.
    h1: "h2",
  },
  exclusiveFilter: (frame) => {
    // Drop empty containers and whitespace-only paragraphs left after
    // unwrapping anchors and discarding chrome.
    if (ALLOWED_TAGS.includes(frame.tag)) {
      const text = frame.text?.replace(/\s+/g, " ").trim() ?? "";
      if (
        text.length === 0 &&
        !["img", "br", "hr", "td", "th"].includes(frame.tag)
      ) {
        return true;
      }
    }
    return false;
  },
};

/** Extract the page title from raw HTML head, if present. */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return match[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

/** Carve out the most likely main-content region before sanitizing. */
function extractMainRegion(html: string): string {
  const patterns = [
    // arXiv-style abstract blocks (FID-020) and common semantic equivalents.
    /<blockquote[^>]*class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/i,
    /<section[^>]*class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
    /<div[^>]*class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*(?:post-content|article-content|entry-content|story-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1].length > 200) {
      return match[1];
    }
  }
  // Fallback: body, or the whole document when no body tag survives minifiers.
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function textLengthOf(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export async function fetchArticle(url: string): Promise<ArticleFetchResult> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(
      `Article request failed: HTTP ${response.status} for ${url}`,
    );
  }

  const buffer = await response.arrayBuffer();
  const truncated = buffer.byteLength > MAX_BYTES;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(
    truncated ? buffer.slice(0, MAX_BYTES) : buffer,
  );

  const sourceTitle = extractTitle(html);
  const region = extractMainRegion(html);
  const textLength = textLengthOf(region);
  const cleaned = sanitizeHtml(region, SANITIZE_OPTIONS);

  return {
    html: cleaned,
    // 200 chars of visible text is the practical floor for "we got the
    // article"; JS-only pages yield far less (nav strings, headlines).
    sufficient: textLength >= 200,
    textLength,
    sourceTitle,
  };
}
