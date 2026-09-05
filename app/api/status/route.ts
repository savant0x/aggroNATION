/**
 * GET /api/status — machine-readable engine heartbeat (FID-2026-0905-002
 * stream A/D). Public: it exposes pipeline health only — no secrets, no
 * user data. Consumed by badge/uptime probes and by the workflow's purge
 * step, which reads the just-finished cycle's failure count for its
 * ::warning:: annotation.
 */

import { NextResponse } from "next/server";

import { getStatusSnapshot } from "@/lib/repositories/cycle-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getStatusSnapshot();
    return NextResponse.json({
      lastCycle: snapshot.lastCycle
        ? {
            ranAt: snapshot.lastCycle.ranAt.toISOString(),
            durationMs: snapshot.lastCycle.durationMs,
            totalSources: snapshot.lastCycle.totalSources,
            succeeded: snapshot.lastCycle.succeeded,
            failed: snapshot.lastCycle.failed,
            itemsFetched: snapshot.lastCycle.itemsFetched,
          }
        : null,
      sources: snapshot.sources.map((s) => ({
        sourceId: s.sourceId,
        sourceType: s.sourceType,
        sourceName: s.sourceName,
        ok: s.ok,
        itemsFetched: s.itemsFetched,
        error: s.error,
        lastRanAt: s.lastRanAt ? s.lastRanAt.toISOString() : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "status unavailable",
      },
      { status: 500 },
    );
  }
}
