import Link from "next/link";

import { siteConfig } from "@/config/site";
import { getAllSources } from "@/lib/repositories/source-repo";
import { countContent } from "@/lib/repositories/content-repo";
import { relativeTime } from "@/lib/format/relative-time";
import type { Source, SourceType } from "@/lib/schemas/content";

export const revalidate = 60;

export const metadata = {
  title: "About",
};

/**
 * Pipeline catalog, exhaustive over SourceType — a new type cannot ship
 * without declaring its copy here (same pattern as TYPE_FALLBACK_IMAGE).
 * Status is NOT part of this record: it is computed from the live source
 * table below, so this page can never claim a pipeline is healthy when it
 * is not (the honest no-fake law applies to marketing copy too — the old
 * hardcoded list claimed X (Twitter) was live after FID-2026-0904-004
 * removed it).
 */
const PIPELINES: Record<SourceType, { name: string; detail: string }> = {
  youtube: {
    name: "YouTube",
    detail:
      "Curated channels via the YouTube Data API — videos play on-site, never off-site.",
  },
  rss: {
    name: "RSS",
    detail:
      "Feed parsing with the publisher's own full-text body rendered in the in-site reader.",
  },
  reddit: {
    name: "Reddit",
    detail:
      "Subreddit hot posts via reddit's official feeds, read on-site with no exits.",
  },
  huggingface: {
    name: "HuggingFace",
    detail: "Daily Papers with community upvotes feeding the ranking.",
  },
  trendshift: {
    name: "Trendshift",
    detail:
      "Trending open-source repos from trendshift.io, enriched with live GitHub repo cards. Surfaced together with discoveries in the GitHub section.",
  },
  opensource: {
    name: "Open Source Projects",
    detail:
      "Newly-discovered projects from opensourceprojects.dev, enriched with GitHub repo cards. Surfaced together with trendshift in the GitHub section.",
  },
};

interface PipelineStatus {
  type: SourceType;
  enabled: number;
  erroring: number;
  items: number;
  lastFetchedAt: Date | null;
}

async function loadStatus(): Promise<{
  pipelines: PipelineStatus[];
  totalItems: number | null;
  lastCycleAt: Date | null;
  failed: boolean;
}> {
  try {
    const sources: Source[] = await getAllSources();
    const totalItems = await countContent({});

    const pipelines: PipelineStatus[] = (
      Object.keys(PIPELINES) as SourceType[]
    ).map((type) => {
      const forType = sources.filter((s) => s.type === type && s.enabled);
      const erroring = forType.filter(
        (s) => s.metadata.lastError || s.metadata.consecutiveErrors > 0,
      );
      const lastFetchedAt = forType.reduce<Date | null>((acc, s) => {
        const t = s.metadata.lastFetchedAt;
        return t && (!acc || t > acc) ? t : acc;
      }, null);
      return {
        type,
        enabled: forType.length,
        erroring: erroring.length,
        items: forType.reduce((sum, s) => sum + s.metadata.totalFetched, 0),
        lastFetchedAt,
      };
    });

    const lastCycleAt = pipelines.reduce<Date | null>((acc, p) => {
      return p.lastFetchedAt && (!acc || p.lastFetchedAt > acc)
        ? p.lastFetchedAt
        : acc;
    }, null);

    return { pipelines, totalItems, lastCycleAt, failed: false };
  } catch (error) {
    console.error("[/about] status load failed:", error);
    return { pipelines: [], totalItems: null, lastCycleAt: null, failed: true };
  }
}

export default async function AboutPage() {
  const { pipelines, totalItems, lastCycleAt, failed } = await loadStatus();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          About {siteConfig.name}
        </h1>
        <p className="text-lg text-muted">
          An AI content aggregator that surfaces the most engaging recent
          content from curated sources — ranked by an engagement + freshness
          score, refreshed automatically, with no algorithm chasing you.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Pipeline status
        </h2>
        <p className="text-sm text-muted">
          Live from the source table — this page re-renders on the same 60s
          freshness floor as the rest of the site.
        </p>
        {failed ? (
          <p role="alert" className="text-sm text-red-400">
            Status query failed — check server logs. Nothing is faked in the
            meantime.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-3 text-sm">
              <span>
                <strong className="font-semibold">
                  {totalItems?.toLocaleString("en") ?? "—"}
                </strong>{" "}
                <span className="text-muted">live items in the index</span>
              </span>
              <span>
                <strong className="font-semibold">
                  {relativeTime(lastCycleAt)}
                </strong>{" "}
                <span className="text-muted">since the last fetch cycle</span>
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pipelines.map((p) => {
                const healthy = p.enabled > 0 && p.erroring === 0;
                const degraded = p.enabled > 0 && p.erroring > 0;
                return (
                  <li
                    key={p.type}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium">
                      {PIPELINES[p.type].name}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {p.enabled > 0
                        ? `${p.enabled} source${p.enabled === 1 ? "" : "s"} · ${p.items.toLocaleString("en")} fetched`
                        : "no sources yet"}
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${
                          healthy
                            ? "bg-[var(--color-accent)]"
                            : degraded
                              ? "bg-amber-400"
                              : "bg-[var(--color-edge)]"
                        }`}
                      />
                      <span className="sr-only">
                        {healthy
                          ? "healthy"
                          : degraded
                            ? `${p.erroring} source(s) erroring`
                            : "idle"}
                      </span>
                      <span className={degraded ? "text-amber-400" : ""}>
                        {healthy
                          ? relativeTime(p.lastFetchedAt)
                          : degraded
                            ? "retrying"
                            : "idle"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          How ranking works
        </h2>
        <p className="text-muted">
          Every item gets a rating in the range 0–100: engagement × 0.6 +
          freshness × 0.4, where engagement blends likes and comments against
          views (comments weigh more — they cost more effort), and freshness
          decays over roughly two weeks. The score is a snapshot from fetch
          time; it is not influenced by what you click.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          The pipelines
        </h2>
        <ul className="flex flex-col gap-2">
          {(Object.keys(PIPELINES) as SourceType[]).map((type) => (
            <li
              key={type}
              className="flex flex-col gap-0.5 rounded-xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-3"
            >
              <span className="font-medium">{PIPELINES[type].name}</span>
              <span className="text-sm text-muted">
                {PIPELINES[type].detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Content freshness
        </h2>
        <p className="text-muted">
          A scheduled job fetches every enabled source on its interval and
          writes results to the same pipeline — nothing on this site is
          hand-picked or faked. Every write purges the site&apos;s caches, so
          the next visitor sees the new content immediately (
          <Link href="/" className="text-[var(--color-accent-bright)]">
            the home page
          </Link>{" "}
          lists every pipeline). Video playback happens right here on the site;
          you are never shipped off to another platform to watch.
        </p>
      </section>
    </div>
  );
}
