/**
 * HuggingFace fetcher (FID-022) — real API integration, NO database imports.
 *
 * Endpoint: GET https://huggingface.co/api/daily_papers — public, unauthenticated,
 * returns the day's curated papers with community upvotes (probed live
 * 2026-09-04: id/title/summary/authors/upvotes/publishedAt all present).
 *
 * Identity: the arXiv paper id (`paper.id`) — deterministic doc ids therefore
 * dedupe across days (a paper shown two days running upserts, not duplicates).
 *
 * Same partial-failure contract as every fetcher: per-item loss is collected
 * into `errors[]`; only "cannot proceed at all" conditions throw.
 */

const HF_DAILY_PAPERS_URL = "https://huggingface.co/api/daily_papers";
const FETCH_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_500;

export class HuggingFaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HuggingFaceError";
  }
}

export interface HFPaper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  upvotes: number;
  publishedAt: Date;
  /** HF discussion thread — kept as metadata; the reader renders in-site. */
  discussionId: string | null;
}

export interface FetchHFPapersResult {
  papers: HFPaper[];
  errors: string[];
}

async function hfGet(): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(HF_DAILY_PAPERS_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      throw new HuggingFaceError(
        `HuggingFace request failed after ${MAX_ATTEMPTS} attempts: ${lastError.message}`,
      );
    }

    if (response.ok) {
      return (await response.json()) as unknown;
    }

    lastError = new HuggingFaceError(
      `HuggingFace daily_papers failed (${response.status}): ${response.statusText}`,
    );
    if (!RETRYABLE_STATUS.has(response.status)) {
      throw lastError;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw lastError ?? new HuggingFaceError("HuggingFace request failed");
}

export async function fetchDailyPapers(options: {
  maxItems: number;
}): Promise<FetchHFPapersResult> {
  const { maxItems } = options;
  const errors: string[] = [];

  const raw = (await hfGet()) as unknown;
  if (!Array.isArray(raw)) {
    throw new HuggingFaceError(
      "HuggingFace daily_papers returned an unexpected shape (expected a JSON array)",
    );
  }

  const papers: HFPaper[] = [];
  for (const entry of (raw as unknown[]).slice(0, maxItems)) {
    const paper = (entry as { paper?: Record<string, unknown> }).paper;
    if (
      !paper ||
      typeof paper.id !== "string" ||
      typeof paper.title !== "string"
    ) {
      errors.push("Skipped a daily-papers entry — missing paper id or title");
      continue;
    }
    const authors = Array.isArray(paper.authors)
      ? paper.authors
          .map((a) =>
            a &&
            typeof a === "object" &&
            typeof (a as { name?: unknown }).name === "string"
              ? (a as { name: string }).name
              : null,
          )
          .filter((a): a is string => a !== null)
      : [];
    const publishedAtRaw =
      typeof paper.publishedAt === "string"
        ? new Date(paper.publishedAt)
        : null;

    papers.push({
      id: paper.id,
      title: paper.title.trim(),
      summary: typeof paper.summary === "string" ? paper.summary.trim() : "",
      authors,
      upvotes:
        typeof paper.upvotes === "number" && Number.isFinite(paper.upvotes)
          ? paper.upvotes
          : 0,
      publishedAt:
        publishedAtRaw && !Number.isNaN(publishedAtRaw.getTime())
          ? publishedAtRaw
          : new Date(),
      discussionId:
        typeof paper.discussionId === "string" ? paper.discussionId : null,
    });
  }

  return { papers, errors };
}
