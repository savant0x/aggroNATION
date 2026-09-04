import { formatMetricCount } from "@/components/home/MetricsRow";
import type { GithubRepoData } from "@/lib/fetchers/github-repos";

/**
 * GitHub repo panel (FID-2026-0904-009). Rendered from the `github` blob
 * denormalized onto content docs at FETCH time — never a per-render API call.
 * Uses Next's Image with a local proxy? No — og-card URLs are remote, so a
 * plain img keeps the remote optimization budget out of it (same law as card
 * previews).
 */
export function GitHubRepoCard({ github }: { github: GithubRepoData }) {
  const repoUrl = `https://github.com/${github.slug}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-edge)] bg-[var(--color-surface)]">
      <a
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={github.ogImageUrl}
          alt={`${github.slug} repository card`}
          className="aspect-[1200/630] w-full object-cover"
          loading="lazy"
        />
      </a>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-accent-bright)]"
            >
              {github.slug}
            </a>
          </h2>
          <div className="flex shrink-0 items-center gap-4 text-sm text-muted">
            <span title={`${github.stars.toLocaleString()} stars`}>
              ★ {formatMetricCount(github.stars)}
            </span>
            <span title={`${github.forks.toLocaleString()} forks`}>
              ⑂ {formatMetricCount(github.forks)}
            </span>
          </div>
        </div>

        {github.description && (
          <p className="text-sm leading-relaxed text-muted">
            {github.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {github.language && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-edge)] px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              {github.language}
            </span>
          )}
          {github.license && (
            <span className="rounded-full border border-[var(--color-edge)] px-2.5 py-1">
              {github.license}
            </span>
          )}
          {github.topics.slice(0, 6).map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-[var(--color-edge)] px-2.5 py-1 text-muted"
            >
              #{topic}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--color-edge)] pt-3 text-sm">
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent-bright)] transition-opacity hover:opacity-80"
          >
            View on GitHub ↗
          </a>
          {github.homepage && (
            <a
              href={github.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted transition-colors hover:text-[var(--color-accent-bright)]"
            >
              Homepage ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
