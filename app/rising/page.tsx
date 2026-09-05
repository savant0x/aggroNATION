import type { Metadata } from "next";

import { ContentGrid } from "@/components/home/ContentGrid";
import { getRisingContent } from "@/lib/repositories/content-repo";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Rising",
  description:
    "Items whose engagement score is climbing fastest across every aggroNATION source.",
};

/**
 * Rising (FID-2026-0904-023 stream H) — items whose rating grew since the
 * previous fetch cycle, biggest jump first, across all sources at once.
 * Honest states: a fresh index has no momentum yet (prev_rating seeds to
 * rating on first sight — delta 0), so the empty state explains the two
 * cycles instead of faking a list.
 */
export default async function RisingPage() {
  let items: Awaited<ReturnType<typeof getRisingContent>> = [];
  let failed = false;
  try {
    items = await getRisingContent({ lookbackHours: 168, limit: 40 });
  } catch (error) {
    console.error("[/rising] load failed:", error);
    failed = true;
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 pb-20 pt-8">
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
          The rising query failed — check server logs. Nothing is faked.
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-12 text-center">
          <p className="text-lg font-medium text-[var(--color-text-muted)]">
            No momentum to show yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            Rising needs two fetch cycles to measure movement — check back after
            the next hourly run. Nothing is faked in the meantime.
          </p>
        </div>
      ) : (
        <ContentGrid items={items} />
      )}
    </div>
  );
}
