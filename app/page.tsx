import { HeroSection } from "@/components/home/HeroSection";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ContentGrid } from "@/components/home/ContentGrid";
import { EmptyState } from "@/components/home/EmptyState";
import {
  getLatestContent,
  getTopContent,
} from "@/lib/repositories/content-repo";
import type { ContentItem, SourceType } from "@/lib/schemas/content";

// ISR: content freshness need is low; avoids per-request reads (free tier).
export const revalidate = 300;

const SECTION_LIMIT = 4;

const SECTIONS: Array<{
  sourceType: SourceType;
  title: string;
}> = [
  { sourceType: "youtube", title: "YouTube" },
  { sourceType: "rss", title: "RSS Feeds" },
  { sourceType: "reddit", title: "Reddit" },
  { sourceType: "x", title: "X (Twitter)" },
];

async function safeGetLatest(sourceType: SourceType): Promise<ContentItem[]> {
  try {
    return await getLatestContent({ sourceType, limit: SECTION_LIMIT });
  } catch (error) {
    // A failing section must not sink the page — log and render empty state.
    console.error(`[Home] Failed to load ${sourceType} section:`, error);
    return [];
  }
}

export default async function Home() {
  const sectionResults = await Promise.all(
    SECTIONS.map(async ({ sourceType, title }) => ({
      sourceType,
      title,
      items: await safeGetLatest(sourceType),
    })),
  );

  let topItems: ContentItem[] = [];
  try {
    topItems = await getTopContent({ limit: 1 });
  } catch (error) {
    console.error("[Home] Failed to load top content:", error);
  }

  const topItem = topItems[0];

  return (
    <div className="flex flex-col gap-16 pb-20">
      <HeroSection topItemTitle={topItem?.title} />

      {topItem && (
        <section aria-label="Top rated content" className="flex flex-col gap-4">
          <SectionHeader
            title="Top rated"
            count={topItems.length}
            href="/youtube"
          />
          <ContentGrid items={[topItem]} />
        </section>
      )}

      {sectionResults.map(({ sourceType, title, items }) => (
        <section key={sourceType} className="flex flex-col gap-4">
          <SectionHeader
            title={title}
            count={items.length}
            href={`/${sourceType}`}
          />
          {items.length > 0 ? (
            <ContentGrid items={items} />
          ) : (
            <EmptyState sourceType={title} />
          )}
        </section>
      ))}
    </div>
  );
}
