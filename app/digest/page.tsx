import Link from "next/link";
import type { Metadata } from "next";

import { getRecentContentDays } from "@/lib/repositories/content-repo";
import { siteConfig } from "@/config/site";

/**
 * The Briefing index (FID-2026-0904-019): list of days that have briefings,
 * newest first, derived from real content dates — no fake calendar entries.
 */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The Briefing",
  description: `Daily digests of the best AI content per category — ${siteConfig.name}`,
  alternates: { canonical: `${siteConfig.url}/digest` },
};

const LOOKBACK_DAYS = 30;

export default async function DigestIndexPage() {
  let days: string[] = [];
  let failed = false;
  try {
    days = await getRecentContentDays({ lookbackDays: LOOKBACK_DAYS });
  } catch (error) {
    console.error("[/digest] index load failed:", error);
    failed = true;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight md:text-4xl">
          The Briefing
        </h1>
        <p className="text-muted">
          One page per day: the best of each category, ranked by engagement ×
          freshness. Subscribe via{" "}
          <a
            href="/digest/feed.xml"
            className="text-[var(--color-accent-bright)] transition-opacity hover:opacity-80"
          >
            RSS ↗
          </a>{" "}
          and the day&apos;s briefing lands in your reader automatically.
        </p>
      </header>

      {failed ? (
        <p role="alert" className="text-sm text-red-400">
          The briefing index query failed — check server logs. Nothing is faked
          in the meantime.
        </p>
      ) : days.length === 0 ? (
        <p className="text-sm text-muted">
          No briefings yet — the pipeline hasn&apos;t indexed content in the
          last {LOOKBACK_DAYS} days.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-edge)]">
          {days.map((day) => (
            <li key={day}>
              <Link
                href={`/digest/${day}`}
                className="flex items-center justify-between py-3 font-medium transition-colors hover:text-[var(--color-accent-bright)]"
              >
                {day}
                <span className="text-sm text-muted">the briefing →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
