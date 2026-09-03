/**
 * Session verification (FID-004) — server-only gate for protected routes.
 *
 * The session cookie is a Firebase session cookie (created from a verified
 * ID token), cryptographically signed by Firebase — it cannot be hand-crafted,
 * unlike the legacy build's plain-base64 session.
 *
 * NOTE: verification deliberately lives in server components/routes, NOT in
 * edge middleware — firebase-admin cannot run on the Edge runtime.
 */

import "server-only";

import { cookies } from "next/headers";

import { adminAuth } from "@/lib/firebase/admin";

export const SESSION_COOKIE = "aggro_session";
export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
 * Verify the session cookie and return the user, or null when absent/invalid.
 * `admin` reflects the Firebase custom claim checked by Firestore rules.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      isAdmin: decoded.admin === true,
    };
  } catch {
    // Expired, revoked, or invalid — treat uniformly as unauthenticated.
    return null;
  }
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
