/**
 * POST /api/auth/logout — end the session (FID-004, hardened in FID-014,
 * migrated per FID-2026-0904-010).
 *
 * supabase.auth.signOut() on the SSR client revokes the refresh token
 * server-side (the copied-cookie hardening from FID-014) AND clears the
 * httpOnly cookie pair via the response cookie store. Best-effort: an
 * invalid/expired session still deserves a cleared cookie — logout must
 * never fail from the client's view.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createSsrSupabase } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createSsrSupabase({
      getAll: async () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    });
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[auth/logout] sign-out failed:", error);
  }

  return NextResponse.json({ ok: true });
}
