import Link from "next/link";
import { Chip } from "@heroui/react";

import type { ContentItem } from "@/lib/schemas/content";
import { TypeFallbackImage } from "@/components/home/TypeFallbackImage";
import { SourceBadge } from "@/components/home/SourceBadge";
import { MetricsRow, formatMetricCount } from "@/components/home/MetricsRow";
import { YouTubeEmbed } from "@/components/home/YouTubeEmbed";

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

  // FID-2026-0904-015: repo items get the compact repo card — text-first,
  // no banner image, source badge inline (it cannot overlay a thumbnail).
  if (item.github) {
    const repoUrl = `https://github.com/${item.github.slug}`;
    return (
      <article className="card-interactive group flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-[var(--color-edge)] bg-[var(--color-surface)] p-4 transition-colors duration-200 hover:border-[color-mix(in_oklab,var(--color-accent)_55%,transparent)]">
        <div className="flex items-center justify-between gap-2">
          {item.sourceName ? (
            <span
              className="max-w-[70%] truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white/90"
              title={`From ${item.sourceName}`}
            >
              {item.sourceName}
            </span>
          ) : (
            <span />
          )}
          <span
            className="shrink-0 text-xs text-muted"
            title={`${item.github.stars.toLocaleString()} stars · ${item.github.forks.toLocaleString()} forks`}
          >
            ★ {formatMetricCount(item.github.stars)} · ⑂{" "}
            {formatMetricCount(item.github.forks)}
          </span>
        </div>

        <h3 className="line-clamp-2 font-[family-name:var(--font-display)] font-semibold leading-snug">
          <Link
            href={readerHref}
            aria-label={`Read about ${item.github.slug} on aggronation`}
            className="text-[var(--color-text-primary)] outline-none transition-colors hover:text-[var(--color-accent-bright)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            {item.github.slug}
          </Link>
        </h3>

        <p className="line-clamp-3 text-sm text-muted">
          {item.github.description || item.excerpt}
        </p>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {item.github.language && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-edge)] px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                {item.github.language}
              </span>
            )}
            {item.github.topics.slice(0, 2).map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-[var(--color-edge)] px-2 py-0.5 text-muted"
              >
                #{topic}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted">
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
          <span className="sr-only">
            <a href={repoUrl} target="_blank" rel="noopener noreferrer">
              {repoUrl}
            </a>
          </span>
        </div>
      </article>
    );
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
