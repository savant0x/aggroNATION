/**
 * GET /api/auth/me — return the current session identity (FID-004).
 *
 * 200 { user } when a valid session exists; 401 when absent/invalid.
 * Also the interim requireAdmin reachability proof until FID-005 lands.
 */

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      uid: user.uid,
      email: user.email,
      isAdmin: user.isAdmin,
    },
  });
}
