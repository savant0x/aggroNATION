/**
 * GET /api/cron/fetch — ingestion entry point for external schedulers
 * (GitHub Actions cron, cron-job.org, …). FID-003.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> header ONLY — never a query
 * parameter (secrets in URLs leak into access logs and proxies), compared
 * with timingSafeEqual over pre-hashed buffers so length differences and
 * early exits leak nothing.
 *
 * 200 = batch ran (per-source outcomes in body — individual failures are
 * data, not transport errors). 401 = bad secret. 500 = unhandled crash.
 *
 * FID-2026-0905-001: auth compare moved to the shared isCronAuthorized
 * helper (one owner, same contract as /api/cron/purge).
 */

import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/auth/cron";
import { runFetchAllSources } from "@/lib/services/fetch-service";
import { purgeContentRoutes } from "@/lib/cache/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFetchAllSources();
    // Content changed — purge the ISR cache so the next visitor sees it.
    purgeContentRoutes();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown fetch failure",
      },
      { status: 500 },
    );
  }
}
