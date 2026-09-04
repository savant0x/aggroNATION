import { HeroSection } from "@/components/home/HeroSection";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ContentGrid } from "@/components/home/ContentGrid";
import { EmptyState } from "@/components/home/EmptyState";
import {
  countContent,
  getLatestContentDiversified,
  getLatestContentMerged,
} from "@/lib/repositories/content-repo";
import type { ContentItem, SourceType } from "@/lib/schemas/content";

// ISR with a 60s freshness floor (FID-2026-0904-011): operator-triggered
// fetches ("Fetch all now", bulk import, auto-fetch on add) purge these
// routes on commit (lib/cache/revalidate), so the next visitor always sees
// fresh data — while idle traffic costs one render per minute instead of
// a full DB query set per view (previously ~240 reads/view on Firestore;
// FID-015's stale-count concern is satisfied by the purge, not by
// force-dynamic).
export const revalidate = 60;

/** 3 rows of 5 (operator spec, FID-019: 15 system-wide). */
const SECTION_LIMIT = 15;

/** Combined GitHub category (FID-2026-0904-009): OSS + trendshift, both
 *  render the same GitHub repo cards. */
const GITHUB_TYPES: SourceType[] = ["opensource", "trendshift"];

const SECTIONS: Array<{
  sourceType: SourceType;
  title: string;
}> = [
  { sourceType: "youtube", title: "YouTube" },
  { sourceType: "rss", title: "RSS Feeds" },
  { sourceType: "reddit", title: "Reddit" },
  { sourceType: "huggingface", title: "HuggingFace" },
];

async function safeGetLatest(sourceType: SourceType): Promise<ContentItem[]> {
  try {
    // Diversified selection (FID-2026-0904-006): fresh-but-fair — no single
    // fast feed can fill a section; every source with recent items surfaces.
    return await getLatestContentDiversified({
      sourceType,
      limit: SECTION_LIMIT,
      perSourceCap: 3,
    });
  } catch (error) {
    // A failing section must not sink the page — log and render empty state.
    console.error(`[Home] Failed to load ${sourceType} section:`, error);
    return [];
  }
}

async function safeGetGithub(): Promise<ContentItem[]> {
  try {
    return await getLatestContentMerged({
      sourceTypes: GITHUB_TYPES,
      limit: SECTION_LIMIT,
      perSourceCap: 3,
    });
  } catch (error) {
    console.error("[Home] Failed to load GitHub section:", error);
    return [];
  }
}

async function safeCount(sourceType?: SourceType): Promise<number | null> {
  try {
    return await countContent({ sourceType });
  } catch (error) {
    console.error(`[Home] Failed to count ${sourceType ?? "all"}:`, error);
    return null;
  }
}

async function safeCountGithub(): Promise<number | null> {
  try {
    return await countContent({ sourceTypes: GITHUB_TYPES });
  } catch (error) {
    console.error("[Home] Failed to count GitHub:", error);
    return null;
  }
}

export default async function Home() {
  const sectionResults = await Promise.all(
    SECTIONS.map(async ({ sourceType, title }) => ({
      sourceType,
      title,
      items: await safeGetLatest(sourceType),
      total: await safeCount(sourceType),
    })),
  );

  const [githubItems, githubTotal] = await Promise.all([
    safeGetGithub(),
    safeCountGithub(),
  ]);

  return (
    <div className="flex flex-col gap-16 pb-20">
      <HeroSection />

      {githubItems.length > 0 && (
        <section
          aria-label="GitHub open source projects"
          className="flex flex-col gap-4"
        >
          <SectionHeader title="GitHub" count={githubTotal} href="/github" />
          <ContentGrid items={githubItems} />
        </section>
      )}

      {sectionResults.map(({ sourceType, title, items, total }) => (
        <section key={sourceType} className="flex flex-col gap-4">
          <SectionHeader title={title} count={total} href={`/${sourceType}`} />
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
