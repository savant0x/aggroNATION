import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/**
 * robots.txt (FID-2026-0904-012 item 4). Allow all crawlers on public
 * content; keep the operator surface and API out of indexes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
