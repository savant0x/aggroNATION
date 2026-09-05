import Link from "next/link";
import { ContentGrid } from "@/components/home/ContentGrid";
import { EmptyState } from "@/components/home/EmptyState";
import {
  countContent,
  getLatestContentDiversified,
  getLatestContentMerged,
  getLatestContentPage,
} from "@/lib/repositories/content-repo";
import type { ContentItem, SourceType } from "@/lib/schemas/content";

/**
 * Shared type-scoped listing page (FID-015 follow-up): /youtube, /rss,
 * /reddit, /huggingface, /trendshift, /opensource and the merged /github all
 * render through this component so layout, pagination, and honesty
 * guarantees stay identical across content types.
 *
 * FID-2026-0904-014: two listing views, both ISR-safe (path-based, no
 * searchParams):
 *   - "highlights" (default, /{type}): diversified round-robin with a
 *     per-source cap — a high-volume feed cannot flood the grid.
 *   - "strict" (/{type}/new and /{type}/page/N): raw newest-first archive.
 */

export const metadata = {
  title: "Browse",
};

/** 4 rows of 5 per page (operator spec, FID-021). */
const PAGE_SIZE = 20;

const TYPE_LABELS: Record<SourceType, string> = {
  youtube: "YouTube",
  rss: "RSS Feeds",
  reddit: "Reddit",
  huggingface: "HuggingFace",
  trendshift: "Trendshift",
  opensource: "Open Source Projects",
};

const TYPE_TAGLINES: Record<SourceType, string> = {
  youtube: "the most recent AI content from curated YouTube channels",
  rss: "the latest articles from curated RSS feeds",
  reddit: "the hottest posts from curated subreddits",
  huggingface: "today's curated AI papers from HuggingFace Daily",
  trendshift: "the trending open-source repos from Trendshift",
  opensource:
    "the newest open-source project discoveries from Open Source Projects",
};
const EMPTY_DETAIL: Record<SourceType, string> = {
  youtube:
    "Add YouTube channels in the admin dashboard — they're fetched immediately.",
  rss: "Add RSS feeds in the admin dashboard — they're fetched immediately.",
  reddit:
    "Add subreddit sources in the admin dashboard — they're fetched immediately via reddit's official feeds.",
  huggingface:
    "Add a HuggingFace source (https://huggingface.co/papers) in the admin dashboard — daily papers fetch immediately.",
  trendshift:
    "Add a Trendshift source (https://trendshift.io/?sort=views) in the admin dashboard — trending repos fetch immediately.",
  opensource:
    "Add an Open Source Projects source (https://www.opensourceprojects.dev/rss) in the admin dashboard — project discoveries fetch immediately.",
};

/** Merged category meta (FID-2026-0904-009) — the GitHub page combines
 *  opensource + trendshift. Keyed by URL segment. */
const MERGED_META: Record<string, { label: string; tagline: string }> = {
  github: {
    label: "GitHub",
    tagline:
      "the trending and newly-discovered open-source repositories from Trendshift and Open Source Projects",
  },
};

export interface TypeListingPageProps {
  /** Single source type, OR sourceTypes for a merged category. */
  sourceType?: SourceType;
  sourceTypes?: SourceType[];
  /** URL segment: "youtube" for /youtube, "github" for the merged page. */
  segment: string;
  /**
   * "highlights" (default view): diversified with per-source cap, no deep
   * pagination — "Older" hands off to the strict archive. "strict": raw
   * newest-first (the /{type}/new and /{type}/page/N archive views).
   */
  sort?: "highlights" | "strict";
  /** 1-based page number, strict mode only. */
  page?: number;
}

export default async function TypeListingPage({
  sourceType,
  sourceTypes,
  segment,
  sort = "highlights",
  page = 1,
}: TypeListingPageProps) {
  const types = sourceTypes ?? (sourceType ? [sourceType] : []);
  const isMerged = Boolean(sourceTypes && sourceTypes.length > 1);
  const merged = isMerged ? MERGED_META[segment] : undefined;
  const label = merged?.label ?? TYPE_LABELS[sourceType!];
  const tagline = merged?.tagline ?? TYPE_TAGLINES[sourceType!];

  let items: ContentItem[] = [];
  let failed = false;

  try {
    if (sort === "highlights") {
      items = isMerged
        ? await getLatestContentMerged({
            sourceTypes: types,
            limit: PAGE_SIZE,
            perSourceCap: 3,
          })
        : await getLatestContentDiversified({
            sourceType: sourceType!,
            limit: PAGE_SIZE,
            perSourceCap: 3,
          });
    } else {
      const result = await getLatestContentPage({
        sourceTypes: types,
        pageSize: PAGE_SIZE,
        page,
      });
      items = result.items;
    }
  } catch (error) {
    console.error(`[/${segment}] Failed to load page:`, error);
    failed = true;
  }

  let total: number | null = null;
  try {
    total = await countContent({ sourceTypes: types });
  } catch (error) {
    console.error(`[/${segment}] count failed:`, error);
  }

  const totalPages =
    total !== null && total > 0 ? Math.ceil(total / PAGE_SIZE) : null;
  const base = `/${segment}`;
  const isHighlights = sort === "highlights";

  return (
    <div className="flex flex-col gap-6 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--color-accent-bright)]"
        >
          ← Back to home
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          {label}
        </h1>
        <p className="max-w-2xl text-muted">
          {total !== null
            ? `${total.toLocaleString("en")} item${total === 1 ? "" : "s"} in the index — ${tagline}.`
            : `The most recent content from curated sources — ${tagline}.`}{" "}
          Everything opens right here on the site — you never leave.
        </p>
        {/* FID-2026-0904-014: the two-view toggle. Pure links — both views
            are cached route shapes, no JS, no searchParams. */}
        <div className="flex items-center gap-4 text-sm">
          {isHighlights ? (
            <>
              <span className="font-medium text-[var(--color-text-primary)]">
                Highlights
              </span>
              <Link
                href={`${base}/new`}
                className="text-muted transition-colors hover:text-[var(--color-accent-bright)]"
              >
                Strict order →
              </Link>
            </>
          ) : (
            <>
              <Link
                href={base}
                className="text-muted transition-colors hover:text-[var(--color-accent-bright)]"
              >
                ← Highlights
              </Link>
              <span className="font-medium text-[var(--color-text-primary)]">
                Strict order
              </span>
            </>
          )}
        </div>
      </header>

      {items.length > 0 ? (
        <>
          <section
            aria-label={`${label} content`}
            className="flex flex-col gap-4"
          >
            <ContentGrid items={items} />
          </section>

          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-4"
          >
            {isHighlights ? (
              <span />
            ) : page > 1 ? (
              <Link
                href={page === 2 ? `${base}/new` : `${base}/page/${page - 1}`}
                className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            {!isHighlights && totalPages !== null && totalPages > 1 && (
              <span className="text-sm text-muted">
                Page {page} of {totalPages.toLocaleString("en")}
              </span>
            )}
            {isHighlights ? (
              totalPages !== null && totalPages > 1 ? (
                <Link
                  href={`${base}/page/2`}
                  className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
                >
                  Older →
                </Link>
              ) : (
                <span />
              )
            ) : totalPages !== null && page < totalPages ? (
              <Link
                href={`${base}/page/${page + 1}`}
                className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
          {isHighlights && totalPages !== null && totalPages > 1 && (
            <p className="text-xs text-muted">
              Showing highlights — one pick per source, freshest first. Older
              pages are the full strict-chronological archive.
            </p>
          )}
        </>
      ) : (
        <EmptyState
          sourceType={label}
          detailOverride={
            failed
              ? "The content query failed — check server logs. Nothing is faked in the meantime."
              : merged
                ? `Add a Trendshift or Open Source Projects source in the admin dashboard — they fetch immediately.`
                : EMPTY_DETAIL[sourceType!]
          }
        />
      )}
    </div>
  );
}
