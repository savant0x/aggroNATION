/**
 * Admin manual fetch trigger (FID-009) — POST /api/admin/fetch.
 *
 * Same pipeline as the cron webhook (runFetchAllSources) but gated by the
 * admin session (FID-004 requireAdmin) instead of CRON_SECRET, so the
 * operator can run a fetch cycle from the dashboard without waiting for the
 * scheduled run. 200 = batch ran (per-source outcomes are data, not errors).
 */

import { NextResponse } from "next/server";

import { AuthError, requireAdmin } from "@/lib/auth/session";
import { runFetchAllSources } from "@/lib/services/fetch-service";
import { purgeContentRoutes } from "@/lib/cache/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    await requireAdmin();
    const result = await runFetchAllSources();
    // Content changed — purge the ISR cache so the next visitor sees it.
    purgeContentRoutes();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[admin/fetch] Unexpected failure:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
