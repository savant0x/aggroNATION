import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AuthError, requireAdmin } from "@/lib/auth/session";
import { purgeContentRoutes } from "@/lib/cache/revalidate";
import { getSourceById } from "@/lib/repositories/source-repo";
import { runFetchForSource } from "@/lib/services/fetch-service";

/**
 * Per-source manual fetch (FID-2026-0905-008 stream B) — POST
 * /api/admin/sources/[id]/fetch. Retrying ONE source no longer costs a full
 * 19-source cycle. Same semantics as the engine path: outcome recorded,
 * streaks updated, cache purged on success.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const source = await getSourceById(id);
    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    const outcome = await runFetchForSource(source);
    // Content may have changed — purge the ISR cache (same contract as
    // fetch-all).
    purgeContentRoutes();
    return NextResponse.json({
      ok: outcome.ok,
      sourceId: outcome.sourceId,
      sourceName: outcome.sourceName,
      itemsFetched: outcome.itemsFetched,
      error: outcome.error ?? null,
      warnings: outcome.warnings,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[admin/sources/fetch] Unexpected failure:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
