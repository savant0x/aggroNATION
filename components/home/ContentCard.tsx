import Link from "next/link";
import { Chip } from "@heroui/react";

import type { ContentItem } from "@/lib/schemas/content";
import { MetricsRow } from "@/components/home/MetricsRow";

interface ContentCardProps {
  item: ContentItem;
}

/**
 * Content preview card — server component, zero client JS. Whole card links
 * to the origin content. Hover lift + edge glow via .card-interactive.
 */
export function ContentCard({ item }: ContentCardProps) {
  return (
    <Link
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${item.title} — opens at ${item.author || item.sourceType}`}
      className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <article className="card-interactive flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)]">
        {item.thumbnailUrl ? (
          <div className="relative aspect-video w-full overflow-hidden">
            {/* Plain img: remote host optimization budget is not worth it for previews. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnailUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-raised)]">
            <span className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--color-edge)]">
              {item.sourceType.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 font-semibold leading-snug text-[var(--color-text-primary)]">
            {item.title}
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
    </Link>
  );
}
