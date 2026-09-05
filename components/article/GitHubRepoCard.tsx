import { formatMetricCount } from "@/components/home/MetricsRow";
import type { GithubRepoData } from "@/lib/fetchers/github-repos";

/**
 * GitHub repo panel (FID-2026-0904-009). Rendered from the `github` blob
 * denormalized onto content docs at FETCH time — never a per-render API call.
 *
 * FID-2026-0904-015: the 1200×630 og-image is gone from this panel. The only
 * call site renders it when `github` data exists, and the og-image duplicated
 * exactly what the panel's text already says (slug, description, stars) —
 * the double-stack read as a rendering bug. The social og-image lives on in
 * generateMetadata (the one place the og-card belongs). Pure text panel now:
 * the styled card IS the visual.
 */
export function GitHubRepoCard({ github }: { github: GithubRepoData }) {
  const repoUrl = `https://github.com/${github.slug}`;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-edge)] bg-[var(--color-surface)] p-5">
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
  );
}
