/**
 * POST /api/auth/session — establish the SSR cookie session from a verified
 * Supabase client session (FID-004, migrated per FID-2026-0904-010).
 *
 * Flow: client signs in with supabase-js (email/password or provider) → posts
 * the session tokens here → server sets the @supabase/ssr httpOnly cookie
 * pair via setSession (refreshes are silent through the middleware) → also
 * ensures the profiles row exists.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { createSsrSupabase } from "@/lib/supabase/ssr";
import { getServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface SessionRequestBody {
  accessToken?: unknown;
  refreshToken?: unknown;
}

export async function POST(request: NextRequest) {
  let body: SessionRequestBody;
  try {
    body = (await request.json()) as SessionRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accessToken =
    typeof body.accessToken === "string" ? body.accessToken : null;
  const refreshToken =
    typeof body.refreshToken === "string" ? body.refreshToken : null;
  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      { error: "accessToken and refreshToken are required" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createSsrSupabase({
    getAll: async () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) =>
        cookieStore.set(name, value, options),
      );
    },
  });

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { error: "Invalid or expired credentials" },
        { status: 401 },
      );
    }

    const user = data.session.user;

    // Profile row (mirrors users/{uid}): created on first sign-in,
    // lastSignInAt refreshed afterwards.
    await getServiceClient()
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          last_sign_in_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    return NextResponse.json({
      ok: true,
      uid: user.id,
      isAdmin: user.app_metadata?.is_admin === true,
    });
  } catch (error) {
    console.error("[auth/session] Unexpected failure:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
