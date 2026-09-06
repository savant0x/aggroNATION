/**
 * Write-path cache purge (FID-2026-0904-011).
 *
 * Content pages are ISR with a freshness floor (revalidate 60s/300s); a
 * content WRITE (cron fetch, admin fetch-now, source create/edit/delete,
 * bulk import) purges exactly the routes whose data it changed so the next
 * visitor gets instantly-fresh data while idle traffic costs zero DB reads.
 *
 * ONE helper owns the route list (Law 13) — never sprinkle revalidatePath at
 * call sites. Comment writes intentionally do NOT purge: comments load
 * client-side through /api/comments (CommentSection is "use client"), so
 * comment pages never carry a server-rendered comment list.
 */

import { revalidatePath } from "next/cache";

/** Static listing routes (page 1 of each type + home + the strict view). */
const CONTENT_ROUTES = [
  "/",
  "/rss",
  "/rss/new",
  "/reddit",
  "/reddit/new",
  "/huggingface",
  "/huggingface/new",
  "/trendshift",
  "/trendshift/new",
  "/opensource",
  "/opensource/new",
  "/github",
  "/github/new",
  "/youtube",
  "/youtube/new",
  // FID-2026-0904-023 discovery routes (were missing — they self-healed only
  // at their revalidate windows until FID-2026-0905-001 closed the gap).
  "/rising",
  "/digest",
  "/digest/[date]",
] as const;

/**
 * Dynamic-segment routes cached per-path (FID-2026-0904-012 item 6):
 * page-2+ listings and the article/watch detail pages. revalidatePath with
 * the route pattern purges every cached instance of the segment — a fetch
 * cycle can add content to any page or create any article.
 */
const CONTENT_PAGE_ROUTES = [
  "/rss/page/[page]",
  "/rss/new/page/[page]",
  "/reddit/page/[page]",
  "/reddit/new/page/[page]",
  "/huggingface/page/[page]",
  "/huggingface/new/page/[page]",
  "/trendshift/page/[page]",
  "/trendshift/new/page/[page]",
  "/opensource/page/[page]",
  "/opensource/new/page/[page]",
  "/github/page/[page]",
  "/github/new/page/[page]",
  "/youtube/page/[page]",
  "/youtube/new/page/[page]",
  "/article/[itemId]",
  "/watch/[videoId]",
  // FID-2026-0904-023 dynamic-segment discovery routes (same gap).
  "/tags/[tag]",
  "/repo/[slug]",
] as const;

/**
 * Purge the content routes. Call AFTER the write batch commits — purging
 * before a commit could cache partial data on the next render.
 */
export function purgeContentRoutes(): void {
  for (const route of CONTENT_ROUTES) {
    revalidatePath(route);
  }
  for (const route of CONTENT_PAGE_ROUTES) {
    revalidatePath(route, "page");
  }
}
