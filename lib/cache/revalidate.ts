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

/** Every content route whose data a fetch cycle or source mutation touches. */
const CONTENT_ROUTES = [
  "/",
  "/rss",
  "/reddit",
  "/huggingface",
  "/trendshift",
  "/opensource",
  "/github",
  "/youtube",
] as const;

/**
 * Purge the content routes. Call AFTER the write batch commits — purging
 * before a commit could cache partial data on the next render.
 */
export function purgeContentRoutes(): void {
  for (const route of CONTENT_ROUTES) {
    revalidatePath(route);
  }
}
