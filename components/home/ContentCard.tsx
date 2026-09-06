import Link from "next/link";
import { Chip } from "@heroui/react";

import type { ContentItem } from "@/lib/schemas/content";
import { TypeFallbackImage } from "@/components/home/TypeFallbackImage";
import { SourceBadge } from "@/components/home/SourceBadge";
import { MetricsRow } from "@/components/home/MetricsRow";
import { YouTubeEmbed } from "@/components/home/YouTubeEmbed";
import { RepoCard } from "@/components/home/RepoCard";

interface ContentCardProps {
  item: ContentItem;
}

/**
 * Content preview card. YouTube items navigate to the in-site watch page;
 * every text type (rss, reddit, huggingface, trendshift, opensource —
 * FID-022) navigates to the in-site article reader — thumbnails and titles
 * in both cases. The no-exit law forbids off-site consumption links; origin
 * urls stay as metadata.
 *
 * FID-2026-0904-015: repo items (github blob present — trendshift +
 * opensource) render a compact TEXT-FIRST card instead of the 1200×630
 * GitHub og-image. At grid scale the og-image sliver is illegible noise that
 * duplicates the card text; the compact card leads with slug, stars/forks,
 * and language, and is host-rate-limit-proof (og-image 429s broke 3/20 cards
 * in the FID-013 walk). Social surfaces (og:image meta) still use the
 * og-card — the grid is the one place it never belonged.
 */
export function ContentCard({ item }: ContentCardProps) {
  if (item.sourceType === "youtube") {
    return <YouTubeEmbed item={item} />;
  }

  const readerHref = `/article/${encodeURIComponent(item.id)}`;

  // FID-2026-0905-006: repo items render the cyberpunk "repo terminal file"
  // card — one component serving every grid (/github, /trendshift,
  // /opensource, /tags, /rising all funnel through here).
  if (item.github) {
    return <RepoCard item={item} />;
  }

  // Real thumbnail wins; otherwise the operator's branded per-type image
  // (FID-2026-0904-001).
  const thumbnail = item.thumbnailUrl ? (
    <div className="relative aspect-video w-full overflow-hidden">
      {/* Plain img: remote host optimization budget is not worth it for previews. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbnailUrl}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <SourceBadge name={item.sourceName} />
    </div>
  ) : (
    <TypeFallbackImage
      sourceType={item.sourceType}
      withBadge
      sourceName={item.sourceName}
    />
  );

  return (
    <article className="card-interactive group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)] transition-colors duration-200 hover:border-[color-mix(in_oklab,var(--color-accent)_55%,transparent)]">
      {readerHref ? (
        <Link
          href={readerHref}
          aria-label={`Read ${item.title} on aggronation`}
          className="relative block outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {thumbnail}
        </Link>
      ) : (
        thumbnail
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug">
          {readerHref ? (
            <Link
              href={readerHref}
              className="text-[var(--color-text-primary)] outline-none transition-colors hover:text-[var(--color-accent-bright)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h3>
        <p className="line-clamp-2 text-sm text-muted">{item.excerpt}</p>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {item.tags.slice(0, 3).map((tag) => (
              <Link
                key={tag}
                href={`/tags/${encodeURIComponent(tag)}`}
                className="rounded-full border border-[var(--color-edge)] px-2 py-0.5 text-muted transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted">
              {item.author || "Unknown"} ·{" "}
              {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                item.publishedAt,
              )}
            </span>
            <Chip
              size="sm"
              variant="tertiary"
              className="shrink-0 border border-[var(--color-edge)] bg-transparent"
            >
              {Math.round(item.metrics.rating * 100)}
            </Chip>
          </div>
          <MetricsRow metrics={item.metrics} />
        </div>
      </div>
    </article>
  );
}
