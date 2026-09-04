import Link from "next/link";
import { Chip } from "@heroui/react";

import type { ContentItem } from "@/lib/schemas/content";
import { TypeFallbackImage } from "@/components/home/TypeFallbackImage";
import { SourceBadge } from "@/components/home/SourceBadge";
import { MetricsRow } from "@/components/home/MetricsRow";
import { YouTubeEmbed } from "@/components/home/YouTubeEmbed";

interface ContentCardProps {
  item: ContentItem;
}

/**
 * Content preview card. YouTube items navigate to the in-site watch page;
 * every text type (rss, reddit, x, huggingface — FID-022) navigates to the
 * in-site article reader — thumbnails and titles in both cases. The no-exit
 * law forbids off-site consumption links; origin urls stay as metadata.
 */
export function ContentCard({ item }: ContentCardProps) {
  if (item.sourceType === "youtube") {
    return <YouTubeEmbed item={item} />;
  }

  const readerHref = `/article/${encodeURIComponent(item.id)}`;

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
