import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import {
  hasReacted,
  reactionCount,
  setReaction,
} from "@/lib/repositories/engagement-repo";
import { getContentById } from "@/lib/repositories/content-repo";

/**
 * Reactions API (FID-2026-0904-023 stream C) — GET (count + mine),
 * POST (toggle "+"). Session-enforced; one reaction per user per item.
 */

export const dynamic = "force-dynamic";

const toggleSchema = z.object({
  contentId: z.string().min(1).max(200),
  on: z.boolean(),
});

export async function GET(request: NextRequest) {
  const contentId = request.nextUrl.searchParams.get("contentId");
  if (!contentId) {
    return NextResponse.json(
      { error: "contentId query parameter is required" },
      { status: 400 },
    );
  }

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json(
      { error: "Session check failed" },
      { status: 500 },
    );
  }

  try {
    const count = await reactionCount(contentId);
    const mine = user ? await hasReacted(user.uid, contentId) : false;
    return NextResponse.json({ count, mine });
  } catch (error) {
    console.error("[reactions] read failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json(
      { error: "Session check failed" },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "Sign in to react" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    if (parsed.data.on) {
      const content = await getContentById(parsed.data.contentId);
      if (!content || content.archived) {
        return NextResponse.json(
          { error: "Content not found" },
          { status: 404 },
        );
      }
    }
    const mine = await setReaction(
      user.uid,
      parsed.data.contentId,
      parsed.data.on,
    );
    const count = await reactionCount(parsed.data.contentId);
    return NextResponse.json({ mine, count });
  } catch (error) {
    console.error("[reactions] toggle failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
