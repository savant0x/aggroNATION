/**
 * GET /api/health — FID-001 verification probe (migrated per
 * FID-2026-0904-010).
 *
 * Confirms both Supabase contexts initialize:
 * - service: service-role client construction + a read-only DB round trip
 * - client: anon-key env completeness (browser config)
 *
 * Deliberately dependency-free and read-only so it is safe to expose.
 */

import { NextResponse } from "next/server";

import { getServiceClient } from "@/lib/supabase/admin";
import { supabaseClientEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // One trivial, bounded read proves the service client can reach the DB.
    const { error } = await getServiceClient()
      .from("content")
      .select("id", { count: "exact", head: true })
      .limit(1);

    return NextResponse.json({
      ok: !error,
      checks: {
        serviceRole: {
          initialized: true,
          dbReachable: !error,
          error: error?.message ?? null,
        },
        clientApp: {
          initialized: Boolean(
            supabaseClientEnv.NEXT_PUBLIC_SUPABASE_URL &&
              supabaseClientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          ),
          projectRef:
            supabaseClientEnv.NEXT_PUBLIC_SUPABASE_URL.replace(
              "https://",
              "",
            ).replace(".supabase.co", "") ?? null,
        },
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Unknown health check failure",
      },
      { status: 500 },
    );
  }
}
