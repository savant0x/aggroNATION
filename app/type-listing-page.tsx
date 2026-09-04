import Link from "next/link";
import { ContentGrid } from "@/components/home/ContentGrid";
import { EmptyState } from "@/components/home/EmptyState";
import {
  countContent,
  getLatestContentPage,
} from "@/lib/repositories/content-repo";
import type { ContentItem, SourceType } from "@/lib/schemas/content";

/**
 * Shared type-scoped listing page (FID-015 follow-up): /youtube, /rss,
 * /reddit, /huggingface, /trendshift, /opensource and the merged /github all
 * render through this component so layout, pagination, and honesty
 * guarantees stay identical across content types.
 *
 * FID-2026-0904-012 item 6: pagination is path-based — the page renders a
 * numeric `page` prop instead of awaiting searchParams. Query strings can
 * never be ISR-cached; path segments can. This is what lets every listing
 * page serve from the ISR cache (the FID's whole point).
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
  /** 1-based page number from the path (/{segment}/page/N). */
  page: number;
}

export default async function TypeListingPage({
  sourceType,
  sourceTypes,
  segment,
  page,
}: TypeListingPageProps) {
  const types = sourceTypes ?? (sourceType ? [sourceType] : []);
  const isMerged = Boolean(sourceTypes && sourceTypes.length > 1);
  const merged = isMerged ? MERGED_META[segment] : undefined;
  const label = merged?.label ?? TYPE_LABELS[sourceType!];
  const tagline = merged?.tagline ?? TYPE_TAGLINES[sourceType!];

  let items: ContentItem[] = [];
  let failed = false;

  try {
    const result = await getLatestContentPage({
      sourceTypes: types,
      pageSize: PAGE_SIZE,
      page,
    });
    items = result.items;
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
                href={page === 2 ? base : `${base}/page/${page - 1}`}
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
                href={`${base}/page/${page + 1}`}
                className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
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
