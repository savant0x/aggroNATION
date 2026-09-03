/**
 * POST /api/auth/session — exchange a verified ID token for a Firebase
 * session cookie (FID-004).
 *
 * Flow: client signs in with the web SDK → ID token posted here → server
 * verifies it against Firebase Auth → creates a 7-day session cookie
 * (httpOnly, secure in production, sameSite=lax) → also ensures the
 * /users/{uid} profile document exists.
 */

import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { SESSION_COOKIE, SESSION_EXPIRY_MS } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface SessionRequestBody {
  idToken?: unknown;
}

export async function POST(request: NextRequest) {
  let body: SessionRequestBody;
  try {
    body = (await request.json()) as SessionRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : null;
  if (!idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_MS,
    });

    // Profile document (rules give the user read/update on their own doc).
    // Created on first sign-in; lastSignInAt refreshed afterwards.
    await adminDb
      .collection("users")
      .doc(decoded.uid)
      .set(
        {
          email: decoded.email ?? null,
          lastSignInAt: new Date(),
        },
        { merge: true },
      );

    const response = NextResponse.json({
      ok: true,
      uid: decoded.uid,
      isAdmin: decoded.admin === true,
    });

    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_EXPIRY_MS / 1000,
      path: "/",
    });

    return response;
  } catch (error) {
    // Distinguish user-facing auth failures from infrastructure crashes.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";

    if (code.startsWith("auth/")) {
      return NextResponse.json(
        { error: "Invalid or expired credentials" },
        { status: 401 },
      );
    }

    console.error("[auth/session] Unexpected failure:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
