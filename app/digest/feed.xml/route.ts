import {
  getRecentContentDays,
  getTopItemsForDate,
} from "@/lib/repositories/content-repo";
import { SOURCE_TYPES, type ContentItem } from "@/lib/schemas/content";
import { siteConfig } from "@/config/site";

/**
 * Outbound briefing feed (FID-2026-0904-019): /digest/feed.xml — an RSS 2.0
 * feed where each item is a daily briefing (one per UTC day that has
 * content, newest 14 days). Others subscribe to aggroNATION.
 */

export const revalidate = 3600;
export const dynamic = "force-static";

const MAX_DAYS_IN_FEED = 14;
const PER_CATEGORY = 5;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(): Promise<Response> {
  const days = (
    await getRecentContentDays({ lookbackDays: 30 }).catch(() => [] as string[])
  ).slice(0, MAX_DAYS_IN_FEED);

  const items: Array<{
    date: string;
    title: string;
    description: string;
    link: string;
    pubDate: string;
  }> = [];

  for (const date of days) {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const sections = await Promise.all(
      SOURCE_TYPES.map(async (sourceType) => ({
        sourceType,
        items: await getTopItemsForDate({
          sourceType,
          dayStart,
          dayEnd,
          limit: PER_CATEGORY,
        }).catch(() => [] as never[]),
      })),
    );
    const lines: string[] = [];
    let count = 0;
    for (const { sourceType, items: top } of sections) {
      if (top.length === 0) continue;
      lines.push(`${sourceType.toUpperCase()}:`);
      for (const item of top as ContentItem[]) {
        lines.push(
          `  ${item.title} (${Math.round(item.metrics.rating * 100)})`,
        );
        count += 1;
      }
    }
    if (count === 0) continue;
    items.push({
      date,
      title: `The Briefing — ${date}`,
      description: `${count} top items: ${lines.join("\n").slice(0, 900)}`,
      link: `${siteConfig.url}/digest/${date}`,
      pubDate: dayStart.toUTCString(),
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(siteConfig.name)} — The Briefing</title>
    <link>${escapeXml(`${siteConfig.url}/digest`)}</link>
    <description>${escapeXml(`Daily digests of the best AI content per category, ranked by engagement and freshness.`)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <description>${escapeXml(item.description)}</description>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
