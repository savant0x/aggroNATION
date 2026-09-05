/**
 * GET /api/cron/purge — cache-invalidation webhook (FID-2026-0905-001).
 *
 * Called by the ingestion runner (GitHub Actions) AFTER a fetch cycle has
 * committed fresh rows to Supabase. The runner writes to the database
 * directly and cannot import next/cache — this route runs the write-path
 * purge inside the Next.js server so Vercel's ISR cache drops every content
 * route immediately instead of waiting out each revalidate window.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (shared isCronAuthorized helper,
 * same contract as /api/cron/fetch). Purging is idempotent and marks routes
 * stale only — no data is fetched or written here, so an empty or repeated
 * call is harmless.
 */

import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/auth/cron";
import { purgeContentRoutes } from "@/lib/cache/revalidate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  purgeContentRoutes();
  return NextResponse.json({ purged: true });
}
