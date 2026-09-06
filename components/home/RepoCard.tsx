import Link from "next/link";

import type { ContentItem } from "@/lib/schemas/content";
import { formatMetricCount } from "@/components/home/MetricsRow";

/**
 * Cyberpunk repo card (FID-2026-0905-006). The grid card for EVERY repo item
 * (trendshift + opensource — all grids funnel through ContentCard, so /github,
 * /trendshift, /opensource, /tags and /rising upgrade at once).
 *
 * Design: a "repo terminal file" panel in the site's own aggro-neon language —
 * clipped top-right corner, scanline texture, power stripe, mono readouts.
 * Token-driven end to end (--color-*, --grid-line, glow tokens) so light mode
 * holds; the slug uses --color-accent (not accent-bright) because cyan fails
 * contrast on white. Glow appears on hover only (FID-006 law), via drop-shadow
 * — box-shadow is clipped away by the clip-path silhouette.
 *
 * Pure server component: no client JS, no network, no Date.now().
 * Semantics preserved from FID-015's compact card: /repo/{slug--} link,
 * /tags topic links, source provenance, rating chip, sr-only origin link.
 */
export function RepoCard({ item }: { item: ContentItem }) {
  if (!item.github) return null;
  const { github } = item;
  const repoUrl = `https://github.com/${github.slug}`;

  return (
    <article className="repo-card repo-card-interactive group relative flex h-full flex-col border border-[var(--color-edge)] bg-[var(--color-surface)] p-4 pl-5">
      <span
        aria-hidden
        className="repo-scanlines pointer-events-none absolute inset-0"
      />
      <span
        aria-hidden
        className="absolute left-0 top-0 h-0.5 w-9 bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] transition-all duration-200 group-hover:w-16"
      />

      <div className="relative flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
          REPO //
        </span>
        {item.sourceName && (
          <span
            className="max-w-[65%] truncate text-[10px] uppercase tracking-[0.08em] text-muted"
            title={`From ${item.sourceName}`}
          >
            {item.sourceName}
          </span>
        )}
      </div>

      <h3 className="relative mt-2 break-all font-mono text-base font-semibold leading-snug">
        <Link
          href={`/repo/${github.slug.replace("/", "--")}`}
          aria-label={`Open the ${github.slug} repository page on aggronation`}
          className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <span className="text-[var(--color-accent)] transition-colors group-hover:text-[var(--color-accent-bright)]">
            {github.slug}
          </span>
          <span className="text-[var(--color-accent-bright)]">_</span>
        </Link>
      </h3>

      <p className="relative mt-1.5 line-clamp-3 text-sm text-muted">
        {github.description || item.excerpt}
      </p>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-muted">
        <span title={`${github.stars.toLocaleString()} stars`}>
          ★ {formatMetricCount(github.stars)}
        </span>
        <span title={`${github.forks.toLocaleString()} forks`}>
          ⑂ {formatMetricCount(github.forks)}
        </span>
        {github.language && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
            />
            {github.language}
          </span>
        )}
      </div>

      <div className="relative mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {github.topics.slice(0, 3).map((topic) => (
          <Link
            key={topic}
            href={`/tags/${encodeURIComponent(topic)}`}
            className="repo-chip-clip border border-[var(--color-edge)] px-2.5 py-0.5 text-muted transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
          >
            #{topic}
          </Link>
        ))}
      </div>

      <div className="relative mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="truncate text-xs text-muted">
          {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
            item.publishedAt,
          )}
        </span>
        <span
          className="repo-chip-clip shrink-0 border border-[var(--color-edge)] bg-[var(--color-raised)] px-2.5 py-0.5 font-mono text-xs tabular-nums text-[var(--color-accent-bright)]"
          title={`Rating ${Math.round(item.metrics.rating * 100)}/100`}
        >
          [{Math.round(item.metrics.rating * 100)}]
        </span>
      </div>

      <span className="sr-only">
        <a href={repoUrl} target="_blank" rel="noopener noreferrer">
          {repoUrl}
        </a>
      </span>
    </article>
  );
}
