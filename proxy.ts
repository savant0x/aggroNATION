/**
 * Session refresh proxy (FID-2026-0904-010; renamed from middleware.ts per
 * FID-2026-0904-021 — Next.js 16 deprecated the middleware file convention,
 * the logic is unchanged). Runs before every matched request: if the access
 * token is near expiry it silently refreshes from the refresh-token cookie
 * and writes the fresh pair back, so server components always read a valid
 * session without being able to write cookies themselves.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not short-circuit on errors here — the middleware exists to
  // keep the session alive, and a missing/invalid session is a normal state
  // (anonymous visitors) that protected code gates downstream.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimizations.
     * (Auth is never needed for those, and skipping them keeps the edge fast.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
