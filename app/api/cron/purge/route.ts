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
 *
 * FID-2026-0905-002 stream D: the response now carries the just-finished
 * cycle's `{ranAt, failed}` so the workflow can warn on source failures.
 */

import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/auth/cron";
import { purgeContentRoutes } from "@/lib/cache/revalidate";
import { getLatestCycle } from "@/lib/repositories/cycle-repo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  purgeContentRoutes();

  // FID-2026-0905-002 stream D: embed the just-finished cycle's health so
  // the runner can annotate source failures. The cycle recorder runs inside
  // the fetch cycle (before this purge), so the latest row IS that cycle.
  // Best-effort: a failed read never blocks the purge itself.
  let cycle: Awaited<ReturnType<typeof getLatestCycle>> = null;
  try {
    cycle = await getLatestCycle();
  } catch (error) {
    console.error("[cron/purge] cycle read failed:", error);
  }

  return NextResponse.json({
    purged: true,
    cycle: cycle
      ? { ranAt: cycle.ranAt.toISOString(), failed: cycle.failed }
      : null,
  });
}
