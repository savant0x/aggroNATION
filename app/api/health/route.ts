/**
 * GET /api/health — FID-001 verification probe.
 *
 * Confirms both Firebase contexts initialize:
 * - admin: Admin SDK app constructed (credentials resolve lazily on first call)
 * - client: web SDK app identity (config completeness)
 *
 * Deliberately dependency-free and read-only so it is safe to expose.
 */

import { NextResponse } from "next/server";

import { adminApp } from "@/lib/firebase/admin";
import { firebaseApp } from "@/lib/firebase/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      checks: {
        adminApp: {
          initialized: Boolean(adminApp),
          name: adminApp.name,
        },
        clientApp: {
          initialized: Boolean(firebaseApp),
          projectId: firebaseApp.options.projectId ?? null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown health check failure",
      },
      { status: 500 },
    );
  }
}
