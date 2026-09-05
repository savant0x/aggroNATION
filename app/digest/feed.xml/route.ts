import {
  getRecentContentDays,
  getTopItemsForDate,
  getTopMovers,
} from "@/lib/repositories/content-repo";
import { SOURCE_TYPES, type ContentItem } from "@/lib/schemas/content";
import { siteConfig } from "@/config/site";

/**
 * Outbound briefing feed (FID-2026-0904-019; params per FID-2026-0904-023
 * stream L): /digest/feed.xml — an RSS 2.0 feed where each item is a daily
 * briefing (one per UTC day that has content, newest 14 days). Others
 * subscribe to aggroNATION.
 *
 * Stream L: `?type=` filters to one source type and `?days=` shortens the
 * window (1–30) so power users can subscribe to exactly their slice
 * (`/digest/feed.xml?type=github&days=7`). The route is dynamic — feed
 * readers are the audience, responses carry CDN s-maxage, and the schema
 * surfaces are never exposed to crawlers.
 */

export const dynamic = "force-dynamic";

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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const sourceType = SOURCE_TYPES.includes(typeParam as never)
    ? (typeParam as (typeof SOURCE_TYPES)[number])
    : null;
  const daysParam = Number(url.searchParams.get("days"));
  const lookbackDays =
    Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 30
      ? Math.floor(daysParam)
      : 30;

  const days = (
    await getRecentContentDays({ lookbackDays }).catch(() => [] as string[])
  ).slice(0, MAX_DAYS_IN_FEED);

  const items: Array<{
    date: string;
    title: string;
    description: string;
    link: string;
    pubDate: string;
  }> = [];

  // FID-2026-0905-003 stream D: momentum block on the newest day's briefing
  // only — data-gated (days[0] IS the newest indexed day), never wall-clock.
  const movers = await getTopMovers({ days: 1, limit: 8 }).catch(
    () => [] as never[],
  );

  for (const date of days) {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const sections = await Promise.all(
      (sourceType ? [sourceType] : SOURCE_TYPES).map(async (st) => ({
        sourceType: st,
        items: await getTopItemsForDate({
          sourceType: st,
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
    const isLatestDay = date === days[0];
    if (isLatestDay && movers.length > 0) {
      lines.push("MOMENTUM (biggest movers this week):");
      for (const m of movers as ContentItem[]) {
        // Same baseline the SQL function ranked by — no drift.
        const prev = m.metrics.ratingWeekAgo ?? m.metrics.rating;
        const delta = m.metrics.rating - prev;
        lines.push(`  ${m.title} (+${(delta * 100).toFixed(1)}%)`);
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

  const feedTitle = sourceType
    ? `${siteConfig.name} — The Briefing (${sourceType})`
    : `${siteConfig.name} — The Briefing`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
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
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}
