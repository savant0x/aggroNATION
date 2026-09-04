/**
 * Supabase SSR session helpers (FID-2026-0904-010) — cookie-bound clients
 * used by server components, route handlers, and middleware.
 *
 * Adopts the canonical @supabase/ssr pattern: the access+refresh tokens live
 * in httpOnly cookies managed by the SSR client; middleware refreshes them on
 * navigation so sessions persist silently (Firebase session cookies were 7d;
 * this preserves that feel — the refresh token is the long-lived half).
 *
 * Next.js 16 note: `cookies()` is async everywhere. Server components and
 * route handlers both pass an async cookie store; components pass a no-op
 * setAll (they cannot write cookies — middleware does the refresh on the
 * next request).
 */

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export interface SsrCookieStore {
  getAll():
    | Promise<Array<{ name: string; value: string }>>
    | Array<{
        name: string;
        value: string;
      }>;
  setAll(
    cookiesToSet: Array<{
      name: string;
      value: string;
      options: CookieOptions;
    }>,
  ): Promise<void> | void;
}

/**
 * Build a cookie-bound Supabase client. `setAll` must write through to the
 * response for route handlers / middleware; server components pass a no-op
 * (middleware persists refreshes on the next request).
 */
export function createSsrSupabase(store: SsrCookieStore) {
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => store.setAll(cookiesToSet),
    },
  });
}
