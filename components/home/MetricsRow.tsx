import type { ContentItem } from "@/lib/schemas/content";

/** Compact metric formatting: 1234 → "1.2K", 5600000 → "5.6M". */
export function formatMetricCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}

/** "3 days ago" style relative time, stable-rendered (no client JS). */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(
    1,
    Math.floor((now.getTime() - date.getTime()) / 1000),
  );

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60],
    ["month", 30 * 24 * 60 * 60],
    ["week", 7 * 24 * 60 * 60],
    ["day", 24 * 60 * 60],
    ["hour", 60 * 60],
    ["minute", 60],
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const [unit, secondsInUnit] of units) {
    if (seconds >= secondsInUnit) {
      return formatter.format(-Math.floor(seconds / secondsInUnit), unit);
    }
  }

  return formatter.format(-seconds, "second");
}

interface MetricsRowProps {
  metrics: ContentItem["metrics"];
}

export function MetricsRow({ metrics }: MetricsRowProps) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      {metrics.views > 0 && (
        <span title={`${metrics.views.toLocaleString()} views`}>
          {formatMetricCount(metrics.views)} views
        </span>
      )}
      {metrics.likes > 0 && (
        <span title={`${metrics.likes.toLocaleString()} likes`}>
          {formatMetricCount(metrics.likes)} likes
        </span>
      )}
      {metrics.comments > 0 && (
        <span title={`${metrics.comments.toLocaleString()} comments`}>
          {formatMetricCount(metrics.comments)} comments
        </span>
      )}
    </div>
  );
}
