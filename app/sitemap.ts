import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import {
  getLatestContentAllTypes,
  countContent,
  getRecentContentDays,
  getTopTags,
} from "@/lib/repositories/content-repo";
import type { SourceType } from "@/lib/schemas/content";

/**
 * sitemap.xml (FID-2026-0904-012 item 4). Static routes + listing pages +
 * every content item, computed server-side from the DB.
 *
 * The route revalidates hourly (below) — it must never render per-request:
 * a crawler hitting it would otherwise trigger a full-table read every time.
 * For the item list we take the newest ALL_TYPES_LIMIT items rather than
 * every row (~700 today, unbounded tomorrow): search engines weight the
 * freshest URLs, and the sitemap stays a bounded, fast query. Listing pages
 * beyond page 1 are omitted on purpose — crawlers discover them by
 * following pagination links.
 */

export const revalidate = 3600;

const LISTING_TYPES: SourceType[] = [
  "youtube",
  "rss",
  "reddit",
  "huggingface",
  "trendshift",
  "opensource",
];

const ALL_TYPES_LIMIT = 1000;

/** Offset pagination floor per listing (Item 6): pages 2..N exist per type. */
const PAGE_SIZE = 20;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: siteConfig.url, lastModified: now, priority: 1 },
    {
      url: `${siteConfig.url}/github`,
      lastModified: now,
      priority: 0.8,
    },
    ...LISTING_TYPES.map((type) => ({
      url: `${siteConfig.url}/${type}`,
      lastModified: now,
      priority: 0.8,
    })),
    {
      url: `${siteConfig.url}/about`,
      lastModified: now,
      priority: 0.3,
    },
    {
      url: `${siteConfig.url}/digest`,
      lastModified: now,
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/rising`,
      lastModified: now,
      priority: 0.7,
    },
    {
      url: `${siteConfig.url}/status`,
      lastModified: now,
      priority: 0.3,
    },
  ];

  try {
    // Listing pages ≥ 2: floor(total / PAGE_SIZE) extra paths per listing.
    const perListingPages = await Promise.all(
      [...LISTING_TYPES, ["opensource", "trendshift"] as SourceType[]].map(
        async (types) => {
          const single = typeof types === "string" ? types : undefined;
          const multi = Array.isArray(types) ? types : undefined;
          const total = await countContent({
            sourceType: single,
            sourceTypes: multi,
          });
          return {
            base: multi ? "/github" : `/${single}`,
            pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
          };
        },
      ),
    );

    const listingPageEntries: MetadataRoute.Sitemap = perListingPages.flatMap(
      ({ base, pages }) =>
        Array.from({ length: pages - 1 }, (_, i) => ({
          url: `${siteConfig.url}${base}/page/${i + 2}`,
          lastModified: now,
          priority: 0.4,
        })),
    );

    // The Briefing days (FID-2026-0904-019): one path per content-bearing
    // UTC day in the trailing 30 — the same derived-on-demand honesty as
    // the index page (a day with no content has no briefing URL).
    const digestDays = await getRecentContentDays({ lookbackDays: 30 });
    const digestEntries: MetadataRoute.Sitemap = digestDays.map((day) => ({
      url: `${siteConfig.url}/digest/${day}`,
      lastModified: new Date(`${day}T00:00:00.000Z`),
      priority: 0.7,
    }));

    // Tag/topic pages (FID-2026-0904-023 stream G): the top 50 tags get
    // crawlable listings — free topic surface from data that already exists.
    const topTags = await getTopTags({ limit: 50 }).catch(() => []);
    const tagEntries: MetadataRoute.Sitemap = topTags.map(({ tag }) => ({
      url: `${siteConfig.url}/tags/${encodeURIComponent(tag)}`,
      lastModified: now,
      priority: 0.5,
    }));

    const items = await getLatestContentAllTypes({ limit: ALL_TYPES_LIMIT });
    const itemEntries: MetadataRoute.Sitemap = items.map((item) => ({
      url:
        item.sourceType === "youtube"
          ? `${siteConfig.url}/watch/${item.externalId}`
          : `${siteConfig.url}/article/${item.id}`,
      lastModified: item.updatedAt,
      priority: 0.6,
    }));

    return [
      ...staticEntries,
      ...listingPageEntries,
      ...digestEntries,
      ...tagEntries,
      ...itemEntries,
    ];
  } catch (error) {
    // Sitemap must not 500 the whole route on a DB blip — serve the static
    // skeleton and let the next hourly revalidate fill items in.
    console.error("[/sitemap.xml] DB read failed:", error);
    return staticEntries;
  }
}
