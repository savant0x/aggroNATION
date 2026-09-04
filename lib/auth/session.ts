/**
 * Session verification (FID-004, migrated to Supabase per FID-2026-0904-010)
 * — server-only gate for protected routes.
 *
 * The session lives in the @supabase/ssr cookie pair (httpOnly). getCurrentUser
 * verifies the access token and reads the admin flag from the JWT's
 * app_metadata (the Supabase custom-claim analog of Firebase's `admin`
 * claim — zero extra lookups per gate; profiles.is_admin mirrors it for SQL).
 * The middleware refreshes the token on navigation so sessions persist
 * silently (Firebase session cookies were 7 days; the refresh token is the
 * long-lived half of the pair).
 */

import "server-only";

import { cookies } from "next/headers";

import { createSsrSupabase } from "@/lib/supabase/ssr";

export interface SessionUser {
  uid: string;
  email: string | null;
  isAdmin: boolean;
}

/** Typed auth failure carried to route handlers for status mapping. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Verify the session cookie pair and return the user, or null when
 * absent/invalid. `isAdmin` reflects the JWT app_metadata claim.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const supabase = createSsrSupabase({
    getAll: async () => cookieStore.getAll(),
    // Server components cannot write cookies — the middleware refreshes the
    // token pair on the next request.
    setAll: async () => {},
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    uid: user.id,
    email: user.email ?? null,
    isAdmin: user.app_metadata?.is_admin === true,
  };
}

/**
 * Require an authenticated admin. Throws AuthError(401) unauthenticated,
 * AuthError(403) authenticated without the admin claim.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError("Authentication required", 401);
  }
  if (!user.isAdmin) {
    throw new AuthError("Admin privileges required", 403);
  }

  return user;
}
