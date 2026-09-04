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
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

import { runFetchAllSources } from "@/lib/services/fetch-service";
import { purgeContentRoutes } from "@/lib/cache/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) {
    return false;
  }

  const provided = match[1];
  const providedHash = new Uint8Array(
    createHash("sha256").update(provided).digest(),
  );
  const expectedHash = new Uint8Array(
    createHash("sha256").update(expected).digest(),
  );

  return timingSafeEqual(providedHash, expectedHash);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
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
