import type { ContentItem } from "@/lib/schemas/content";
import { ContentCard } from "@/components/home/ContentCard";

interface ContentGridProps {
  items: ContentItem[];
}

/** Responsive 4-col grid (4 → 2 → 1). Server component. */
export function ContentGrid({ items }: ContentGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <ContentCard key={item.id} item={item} />
      ))}
    </div>
  );
}
