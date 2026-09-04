/**
 * POST /api/auth/register — server-assisted registration
 * (FID-014, migrated per FID-2026-0904-010).
 *
 * Day-1 tradeoff (recorded): the hosted project has email confirmation
 * enabled, which blocks password sign-in until a confirmation link is
 * clicked. This single-operator app auto-confirms at create time via the
 * service role (`email_confirm: true`); real email verification is a
 * future hardening, not a launch requirement.
 *
 * After a 200 the client signs in with the password (normal path) and
 * exchanges the session via POST /api/auth/session.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { adminAuth } from "@/lib/supabase/admin";
import { getServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  displayName: z.string().max(60).optional(),
});

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof registerSchema>;
  try {
    parsed = registerSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Email, password (min 6 chars), and optional display name" },
      { status: 400 },
    );
  }

  const displayName = parsed.displayName?.trim() ?? "";

  try {
    const { data, error } = await adminAuth().createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: displayName ? { display_name: displayName } : undefined,
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("already registered")) {
        return NextResponse.json(
          {
            error:
              "That email already has an account — try signing in instead.",
          },
          { status: 409 },
        );
      }
      if (message.includes("password")) {
        return NextResponse.json(
          { error: "Password too weak — use at least 6 characters." },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: "Registration failed. Try again." },
        { status: 422 },
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: "Registration failed. Try again." },
        { status: 500 },
      );
    }

    // Profile row with the auth user id (mirrors users/{uid}).
    await getServiceClient().from("profiles").upsert(
      {
        id: data.user.id,
        email: parsed.email,
        is_admin: false,
      },
      { onConflict: "id" },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/register] Unexpected failure:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
