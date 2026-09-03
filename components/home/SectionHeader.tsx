import Link from "next/link";

interface SectionHeaderProps {
  title: string;
  count: number;
  href: string;
}

export function SectionHeader({ title, count, href }: SectionHeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        {title}
        {count > 0 && (
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
