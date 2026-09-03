interface EmptyStateProps {
  sourceType: string;
}

/**
 * Honest empty state (Law 5 — no mocks, no fake shimmer pretending data is
 * coming). States exactly what is missing and why.
 */
export function EmptyState({ sourceType }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-12 text-center">
      <p className="font-[family-name:var(--font-display)] text-lg font-medium text-[var(--color-text-muted)]">
        No {sourceType} content yet
      </p>
      <p className="max-w-md text-sm text-muted">
        The aggregation pipeline hasn&apos;t fetched any {sourceType} items.
        Once a {sourceType} source is registered and the hourly fetch runs,
        content appears here — nothing is faked in the meantime.
      </p>
    </div>
  );
}
