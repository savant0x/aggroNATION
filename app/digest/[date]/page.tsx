import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTopItemsForDate } from "@/lib/repositories/content-repo";
import { SOURCE_TYPES, type SourceType } from "@/lib/schemas/content";
import { siteConfig } from "@/config/site";

/**
 * The Briefing (FID-2026-0904-019): the day's best content per category,
 * ranked by the stored rating snapshot. ISR-cached; derived on demand —
 * no digest table, no cron writes. `/digest/2026-09-04` is a stable,
 * shareable URL that always shows that UTC day's briefing.
 */

export const revalidate = 3600;

const PER_CATEGORY = 5;

const CATEGORY_LABELS: Record<SourceType, string> = {
  youtube: "YouTube",
  rss: "RSS",
  reddit: "Reddit",
  huggingface: "HuggingFace",
  trendshift: "Trendshift",
  opensource: "Open Source Projects",
};

export function generateStaticParams() {
  // Same runtime-ISR contract as article/watch (FID-012 E3): nothing at
  // build; cache per-path on first request.
  return [];
}

interface DigestPageProps {
  params: Promise<{ date: string }>;
}

function isValidDate(slug: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(slug) && !Number.isNaN(Date.parse(slug));
}

export async function generateMetadata({
  params,
}: DigestPageProps): Promise<Metadata> {
  const { date } = await params;
  return {
    title: `The Briefing — ${date}`,
    description: `The day's best AI content per category, ranked — ${siteConfig.name}`,
    alternates: { canonical: `${siteConfig.url}/digest/${date}` },
  };
}

export default async function DigestPage({ params }: DigestPageProps) {
  const { date } = await params;
  if (!isValidDate(date)) {
    notFound();
  }
  // UTC day boundaries from the YYYY-MM-DD slug. Future dates need no
  // special case: their query returns zero rows and the honest empty-day
  // panel renders — no wall-clock read during render (purity rule), and
  // the ISR cache never holds anything misleading either way.
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const sections = await Promise.all(
    SOURCE_TYPES.map(async (sourceType) => ({
      sourceType,
      items: await getTopItemsForDate({
        sourceType,
        dayStart,
        dayEnd,
        limit: PER_CATEGORY,
      }).catch(() => [] as never[]),
    })),
  );

  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/digest"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--color-accent-bright)]"
        >
          ← All briefings
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight md:text-4xl">
          The Briefing — {date}
        </h1>
        <p className="text-muted">
          {totalItems > 0
            ? `The day's top ${totalItems} items across ${sections.filter((s) => s.items.length > 0).length} categories — ranked by engagement × freshness, not by what anyone clicked.`
            : "No content was published on this date."}
        </p>
        <div className="flex gap-3 text-sm">
          <a
            href="/digest/feed.xml"
            className="text-[var(--color-accent-bright)] transition-opacity hover:opacity-80"
          >
            Subscribe via RSS ↗
          </a>
          <a
            href={`/digest/${prevDay(date)}`}
            className="text-muted transition-colors hover:text-[var(--color-accent-bright)]"
          >
            ← Previous day
          </a>
        </div>
      </header>

      {totalItems === 0 ? (
        <p role="alert" className="text-sm text-muted">
          Nothing was indexed for this date — the pipeline may not have been
          running yet. Nothing is faked in the meantime.
        </p>
      ) : (
        sections
          .filter((s) => s.items.length > 0)
          .map(({ sourceType, items }) => (
            <section key={sourceType} className="flex flex-col gap-3">
              <h2 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-xl font-bold">
                {CATEGORY_LABELS[sourceType]}
                <span className="text-xs font-normal text-muted">
                  top {items.length}
                </span>
              </h2>
              <ol className="flex flex-col divide-y divide-[var(--color-edge)]">
                {items.map((item, rank) => (
                  <li
                    key={item.id}
                    className="flex items-baseline gap-3 py-2.5"
                  >
                    <span className="w-6 shrink-0 text-right text-sm font-semibold text-muted">
                      {rank + 1}.
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={
                          item.sourceType === "youtube"
                            ? `/watch/${encodeURIComponent(item.externalId)}`
                            : `/article/${encodeURIComponent(item.id)}`
                        }
                        className="line-clamp-2 font-medium leading-snug transition-colors hover:text-[var(--color-accent-bright)]"
                      >
                        {item.title}
                      </Link>
                      <span className="truncate text-xs text-muted">
                        {item.sourceName ?? (item.author || "Unknown")} ·{" "}
                        {Math.round(item.metrics.rating * 100)} score
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))
      )}
    </div>
  );
}

function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
