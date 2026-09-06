import Link from "next/link";
import { ContentGrid } from "@/components/home/ContentGrid";
import { EmptyState } from "@/components/home/EmptyState";
import { MERGED, PIPELINES } from "@/config/pipelines";
import {
  countContent,
  getDiversifiedContentPage,
  getIndexUpdatedAt,
  getLatestContentPage,
} from "@/lib/repositories/content-repo";
import { relativeTime } from "@/lib/format/relative-time";
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
  const merged = isMerged ? MERGED[segment] : undefined;
  const pipeline = sourceType ? PIPELINES[sourceType] : undefined;
  const label = merged?.label ?? pipeline?.label ?? segment;
  const tagline = merged?.tagline ?? pipeline?.tagline ?? "";

  let items: ContentItem[] = [];
  let failed = false;
  // FID-2026-0905-007: exact pool size for the highlights view ("Page N of
  // M"); strict totals come from countContent below.
  let highlightsTotal: number | null = null;

  try {
    if (sort === "highlights") {
      // FID-2026-0905-007: every highlights page — including page 1 — comes
      // from the SAME page-able pool, so /page/2 is provably disjoint from
      // /. (The home grid keeps the round-robin selector; listing pages
      // trade interleave order for coherent pagination.) Auto-cap keeps
      // floods capped while few-source categories pool full depth.
      const result = await getDiversifiedContentPage({
        sourceType,
        sourceTypes: isMerged ? types : undefined,
        pageSize: PAGE_SIZE,
        page,
      });
      items = result.items;
      highlightsTotal = result.total;
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

  // FID-2026-0905-002 stream B: index freshness, from real data. One scalar
  // read; stamp refreshes via the hourly write-path purge, so its staleness
  // is bounded by this page's revalidate window (the honest cadence).
  let indexUpdated: Date | null = null;
  try {
    indexUpdated = await getIndexUpdatedAt();
  } catch (error) {
    console.error(`[/${segment}] freshness probe failed:`, error);
  }

  const totalPages =
    (sort === "highlights"
      ? highlightsTotal
      : total !== null
        ? total
        : null) !== null
      ? Math.ceil(
          (sort === "highlights" ? highlightsTotal! : total!) / PAGE_SIZE,
        )
      : null;
  const base = `/${segment}`;
  const isHighlights = sort === "highlights";

  // FID-2026-0905-007 URL contract: highlights lives at / and /page/N;
  // strict lives at /new and /new/page/N. Both modes paginate.
  const olderHref = isHighlights
    ? `${base}/page/${page + 1}`
    : page === 1
      ? `${base}/new/page/2`
      : `${base}/new/page/${page + 1}`;
  const newerHref = isHighlights
    ? page === 2
      ? base
      : `${base}/page/${page - 1}`
    : page === 2
      ? `${base}/new`
      : `${base}/new/page/${page - 1}`;

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
        {indexUpdated && (
          <p className="text-xs text-muted">
            Index updated {relativeTime(indexUpdated)} · refreshes hourly
          </p>
        )}
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
            {page > 1 ? (
              <Link
                href={newerHref}
                className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            {totalPages !== null && totalPages > 1 && (
              <span className="text-sm text-muted">
                Page {page} of {totalPages.toLocaleString("en")}
              </span>
            )}
            {totalPages !== null && page < totalPages ? (
              <Link
                href={olderHref}
                className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
          {isHighlights && (
            <p className="text-xs text-muted">
              Balanced across sources — capped per feed so no single channel can
              flood the page; deeper pages go deeper into each feed. The raw
              strict-chronological archive is one click away via “Strict order
              →”.
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
                ? "Add a Trendshift or Open Source Projects source in the admin dashboard — they fetch immediately."
                : pipeline?.emptyDetail
          }
        />
      )}
    </div>
  );
}
