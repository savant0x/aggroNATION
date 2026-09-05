/**
 * Content-quality scrubber (FID-2026-0904-018): detects aggregator junk
 * patterns in stored article bodies so pollution is caught the day a new
 * publisher quirk lands it — not weeks later when a human notices.
 *
 * The patterns come from the FID-2026-0904-017 corpus audit (which found
 * exactly one real-world pattern: hnrss's "Article URL / Comments URL /
 * Points" template). Each check here mirrors or generalizes those audit
 * buckets. Detection only — scrubbing stays a human decision via the
 * companion SQL; this module never deletes content autonomously.
 *
 * Runs daily from the fetch cycle (runScrubAndReport): findings land in
 * server logs and the returned ScrubFinding[]; the cron workflow surfaces
 * them as job annotations. Zero findings = no log noise.
 */

export interface ScrubFinding {
  contentId: string;
  pattern: string;
  preview: string;
}

interface JunkPattern {
  name: string;
  /** plain text of the body. */
  test: (plain: string) => boolean;
}

const PATTERNS: JunkPattern[] = [
  {
    name: "aggregator-metadata-template",
    test: (p) => /\bArticle URL\s*:/i.test(p) && /\bComments URL\s*:/i.test(p),
  },
  {
    name: "url-dump",
    test: (p) => {
      const links = (p.match(/https?:\/\//g) ?? []).length;
      return links >= 3 && p.replace(/https?:\/\/\S+/g, "").trim().length < 120;
    },
  },
  {
    name: "read-more-stub",
    test: (p) =>
      /^(read more|continue reading|view full article|open full article)\b[\s.!]*$/i.test(
        p,
      ),
  },
  {
    name: "share-prompt-stub",
    test: (p) => /^(share|share this|shared this story)\b[\s.!]*$/i.test(p),
  },
  {
    name: "suspiciously-short-body",
    test: (p) => p.length < 80,
  },
];

export function htmlToPlainText(html: string): string {
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

export function detectJunk(html: string): string | null {
  const plain = htmlToPlainText(html);
  if (plain.length === 0) return "empty-body";
  for (const pattern of PATTERNS) {
    if (pattern.test(plain)) return pattern.name;
  }
  return null;
}
