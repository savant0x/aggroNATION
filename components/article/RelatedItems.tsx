import Link from "next/link";

import { getRelatedContent } from "@/lib/repositories/content-repo";
import type { ContentItem } from "@/lib/schemas/content";

/**
 * "Read next" (FID-2026-0904-023 stream D) — same-type items ranked by tag
 * overlap, then same source, then freshness. Server component; failure
 * renders nothing rather than breaking the article page.
 */

export async function RelatedItems({
  contentId,
  currentPath,
}: {
  contentId: string;
  currentPath: string;
}) {
  let items: ContentItem[] = [];
  try {
    items = await getRelatedContent({ contentId, limit: 4 });
  } catch (error) {
    console.error("[related] load failed:", error);
    return null;
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Related content" className="flex flex-col gap-3">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
        Read next
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const href =
            item.sourceType === "youtube"
              ? `/watch/${item.externalId}`
              : `/article/${item.id}`;
          if (href === currentPath) {
            return null; // Never suggest the page you're on.
          }
          return (
            <li key={item.id}>
              <Link
                href={href}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--color-accent)]"
              >
                <span className="truncate">{item.title}</span>
                <span className="flex-shrink-0 text-xs uppercase tracking-[0.12em] text-muted">
                  {item.sourceType}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
