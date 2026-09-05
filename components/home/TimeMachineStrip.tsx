import Link from "next/link";

import { getTimeMachineWeek } from "@/lib/repositories/content-repo";
import type { ContentItem } from "@/lib/schemas/content";

/**
 * Time machine (FID-2026-0904-023 stream K) — "one week ago, the index was
 * watching this": the day's top items from exactly one week ago. The window
 * is computed inside Postgres (content_time_machine_week) so this component
 * never reads the clock during render (purity rule); the ISR floor keeps it
 * fresh.
 */

const MAX_ITEMS = 4;

export async function TimeMachineStrip() {
  let items: ContentItem[] = [];
  try {
    items = await getTimeMachineWeek({ limit: MAX_ITEMS });
  } catch (error) {
    console.error("[time-machine] load failed:", error);
    return null; // A dead strip must never break the home page.
  }

  if (items.length === 0) {
    return null; // Honest: no index a week ago → no strip.
  }

  // Pure derivation: the label comes from the items' own dates (the window
  // itself lives in SQL) — no wall-clock read during render.
  const dateLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(items[0].publishedAt);

  return (
    <section aria-label="One week ago" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
          One week ago
        </h2>
        <span className="text-xs uppercase tracking-[0.14em] text-muted">
          {dateLabel}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={
                item.sourceType === "youtube"
                  ? `/watch/${item.externalId}`
                  : `/article/${item.id}`
              }
              className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--color-accent)]"
            >
              <span className="truncate">{item.title}</span>
              <span className="flex-shrink-0 text-xs uppercase tracking-[0.12em] text-muted">
                {item.sourceType}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
