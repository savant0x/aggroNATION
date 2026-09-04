import Link from "next/link";

interface SectionHeaderProps {
  title: string;
  /** Real total for the slice (null = count unavailable — render nothing). */
  count: number | null;
  href: string;
}

export function SectionHeader({ title, count, href }: SectionHeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        {title}
        {count !== null && count > 0 && (
          <span className="ml-3 text-sm font-normal text-muted">
            {count} item{count === 1 ? "" : "s"}
          </span>
        )}
      </h2>
      <Link
        href={href}
        className="text-sm text-muted transition-colors hover:text-[var(--color-accent-bright)]"
      >
        View all →
      </Link>
    </div>
  );
}
