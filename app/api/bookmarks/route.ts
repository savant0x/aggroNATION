import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import {
  isBookmarked,
  listBookmarks,
  setBookmark,
} from "@/lib/repositories/engagement-repo";
import { getContentById } from "@/lib/repositories/content-repo";

/**
 * Bookmarks API (FID-2026-0904-023 stream A) — GET (list mine / probe one),
 * POST (toggle). Session-enforced like comments; the service client never
 * sees an unauthenticated request from these routes.
 */

export const dynamic = "force-dynamic";

const toggleSchema = z.object({
  contentId: z.string().min(1).max(200),
  saved: z.boolean(),
});

export async function GET(request: NextRequest) {
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
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }

  const contentId = request.nextUrl.searchParams.get("contentId");
  try {
    if (contentId) {
      return NextResponse.json({
        saved: await isBookmarked(user.uid, contentId),
      });
    }
    const rows = await listBookmarks(user.uid, 500);
    return NextResponse.json({ bookmarks: rows });
  } catch (error) {
    console.error("[bookmarks] read failed:", error);
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
    return NextResponse.json(
      { error: "Sign in to save items" },
      { status: 401 },
    );
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
    if (parsed.data.saved) {
      const content = await getContentById(parsed.data.contentId);
      if (!content || content.archived) {
        return NextResponse.json(
          { error: "Content not found" },
          { status: 404 },
        );
      }
    }
    const saved = await setBookmark(
      user.uid,
      parsed.data.contentId,
      parsed.data.saved,
    );
    return NextResponse.json({ saved });
  } catch (error) {
    console.error("[bookmarks] toggle failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
