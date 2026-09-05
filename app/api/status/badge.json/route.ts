/**
 * GET /api/status/badge.json — shields.io endpoint-badge payload
 * (FID-2026-0905-003 stream A). Public, CORS-permissive, shields-cache
 * friendly. Reads the same fetch_cycles log as /status — the badge can
 * never show a different truth than the page.
 *
 * Shape contract: https://shields.io/badges/endpoint-badge
 *   { schemaVersion: 1, label, message, color }
 *
 * The message deliberately omits the cycle's age: shields caches responses
 * (~5 min), and an age that freezes between refreshes would be a small lie
 * — counts don't lie when frozen.
 */

import { NextResponse } from "next/server";

import { getStatusSnapshot } from "@/lib/repositories/cycle-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300",
  };

  let snapshot: Awaited<ReturnType<typeof getStatusSnapshot>> | null = null;
  try {
    snapshot = await getStatusSnapshot();
  } catch (error) {
    console.error("[badge] status read failed:", error);
    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "engine",
        message: "status unavailable",
        color: "red",
      },
      { headers: base },
    );
  }

  const last = snapshot.lastCycle;
  if (!last) {
    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "engine",
        message: "no cycle recorded",
        color: "red",
      },
      { headers: base },
    );
  }

  return NextResponse.json(
    {
      schemaVersion: 1,
      label: "engine",
      message: `${last.succeeded}/${last.totalSources} sources · ${last.itemsFetched} items`,
      color: last.failed === 0 ? "green" : "orange",
    },
    { headers: base },
  );
}
