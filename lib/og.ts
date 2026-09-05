import { siteConfig } from "@/config/site";
import type { ContentItem } from "@/lib/schemas/content";

/**
 * OG card URL builder (FID-2026-0904-022 stream B) — the single shared
 * constructor for generated-card URLs. Absolute URLs only (social crawlers
 * reject relative og:image).
 */

export function ogImageUrl(item: ContentItem): string {
  const params = new URLSearchParams({
    title: item.title,
    type: item.sourceType,
    meta: [item.author, item.sourceName].filter(Boolean).join(" · "),
  });
  return `${siteConfig.url}/og?${params.toString()}`;
}
