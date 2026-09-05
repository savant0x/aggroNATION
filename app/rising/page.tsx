import type { Metadata } from "next";

import { ContentGrid } from "@/components/home/ContentGrid";
import {
  getRisingContent,
  getTopMovers,
} from "@/lib/repositories/content-repo";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Rising",
  description:
    "Items whose engagement score is climbing fastest across every aggroNATION source.",
};

/**
 * Rising (FID-2026-0904-023 stream H; tuned per FID-2026-0905-002 stream C).
 *
 * Two honest views of the same truth:
 *   - "Climbing now" — relative momentum (retuned content_rising): surfaces
 *     percentage-climbers that absolute deltas drown.
 *   - "Biggest moves this week" — absolute delta gainers over 7 days, with
 *     the delta displayed from metrics.prevRating (schema no longer strips
 *     it). Decay cannot fake either view: both require a real gain.
 *
 * Empty states stay honest: momentum needs two fetch cycles of coverage.
 */
export default async function RisingPage() {
  let climbing: Awaited<ReturnType<typeof getRisingContent>> = [];
  let movers: Awaited<ReturnType<typeof getTopMovers>> = [];
  let failed = false;
  try {
    [climbing, movers] = await Promise.all([
      getRisingContent({ lookbackHours: 168, limit: 40 }),
      getTopMovers({ days: 7, limit: 12 }),
    ]);
  } catch (error) {
    console.error("[/rising] load failed:", error);
    failed = true;
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-8 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          Rising 🚀
        </h1>
        <p className="max-w-2xl text-muted">
          The items whose engagement score is climbing fastest right now —
          measured across every source between fetch cycles. No algorithm
          chasing you; just momentum.
        </p>
      </header>

      {failed ? (
        <p role="alert" className="text-sm text-red-400">
          The momentum queries failed — check server logs. Nothing is faked.
        </p>
      ) : (
        <>
          <section aria-label="Climbing now" className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Climbing now</h2>
            {climbing.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-10 text-center">
                <p className="text-lg font-medium text-[var(--color-text-muted)]">
                  No momentum to show yet.
                </p>
                <p className="mt-1 text-sm text-muted">
                  Rising needs two fetch cycles to measure movement — check back
                  after the next hourly run. Nothing is faked in the meantime.
                </p>
              </div>
            ) : (
              <ContentGrid items={climbing} />
            )}
          </section>

          {movers.length > 0 && (
            <section
              aria-label="Biggest moves this week"
              className="flex flex-col gap-4"
            >
              <h2 className="text-lg font-semibold">Biggest moves this week</h2>
              <ol className="flex flex-col gap-2">
                {movers.map((item) => {
                  // Same baseline the SQL function ranked by (week-ago), so
                  // the displayed delta IS the ranking delta — no drift.
                  const prev =
                    item.metrics.ratingWeekAgo ?? item.metrics.rating;
                  const delta = item.metrics.rating - prev;
                  return (
                    <li key={item.id}>
                      <a
                        href={`/article/${item.id}`}
                        className="flex items-center gap-3 rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--color-accent)]"
                      >
                        <span className="font-medium text-emerald-400">
                          +{(delta * 100).toFixed(1)}%
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {item.sourceType}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
