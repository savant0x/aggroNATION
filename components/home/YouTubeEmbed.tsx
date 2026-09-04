"use client";

/**
 * YouTube card (FID-013). Play button and title both navigate to the
 * in-site watch page (/watch/{videoId}) where the video plays embedded —
 * never in-row, never off-site (operator product law). The card thumbnail
 * stays a preview; consumption happens on the watch page.
 *
 * (FID-011's in-row expand/collapse and FID-007's modal are both superseded.)
 */

import Link from "next/link";

import type { ContentItem } from "@/lib/schemas/content";
import { TypeFallbackImage } from "@/components/home/TypeFallbackImage";
import { SourceBadge } from "@/components/home/SourceBadge";
import { MetricsRow } from "@/components/home/MetricsRow";

interface YouTubeEmbedProps {
  item: ContentItem;
}

function watchHref(externalId: string): string {
  const id = externalId.startsWith("youtube_")
    ? externalId.slice("youtube_".length)
    : externalId;
  return `/watch/${encodeURIComponent(id)}`;
}

export function YouTubeEmbed({ item }: YouTubeEmbedProps) {
  const href = watchHref(item.externalId);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)] transition-colors duration-200 hover:border-[color-mix(in_oklab,var(--color-accent)_55%,transparent)]">
      <Link
        href={href}
        aria-label={`Watch ${item.title} on ${"aggronation"}`}
        className="relative block aspect-video w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        {item.thumbnailUrl ? (
          // Plain img: remote host optimization budget is not worth it for previews.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <TypeFallbackImage sourceType={item.sourceType} />
        )}
        {/* One badge anchored to the link container covers both image and
            fallback branches (no double render inside the fallback). */}
        <SourceBadge name={item.sourceName} />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/30"
        >
          <span className="glow-accent flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)]/90 opacity-90 transition-opacity duration-200 group-hover:opacity-100">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 translate-x-[1px]"
              fill="white"
              aria-hidden="true"
            >
              <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.9l10.7-6.86a1.06 1.06 0 0 0 0-1.8L9.56 4.24A1.06 1.06 0 0 0 8 5.14Z" />
            </svg>
          </span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug">
          <Link
            href={href}
            className="text-[var(--color-text-primary)] outline-none transition-colors hover:text-[var(--color-accent-bright)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            {item.title}
          </Link>
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
            <span className="shrink-0 rounded-full border border-[var(--color-edge)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
              {Math.round(item.metrics.rating * 100)}
            </span>
          </div>
          <MetricsRow metrics={item.metrics} />
        </div>
      </div>
    </article>
  );
}
