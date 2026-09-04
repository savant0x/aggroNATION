import type { ContentItem } from "@/lib/schemas/content";
import { ContentCard } from "@/components/home/ContentCard";

interface ContentGridProps {
  items: ContentItem[];
}

/**
 * Responsive grid — 5 columns at desktop (3 rows of 5 with 15 items,
 * FID-019 system-wide page size), collapsing to 2 then 1 on smaller
 * screens. Server component.
 */
export function ContentGrid({ items }: ContentGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <ContentCard key={item.id} item={item} />
      ))}
    </div>
  );
}
