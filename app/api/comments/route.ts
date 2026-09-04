/**
 * Comments API (FID-013) — GET (public list) & POST (signed-in create).
 * Read matches the world-readable content law; writes require a session and
 * reference an existing, non-archived content document.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getContentById } from "@/lib/repositories/content-repo";
import { createComment, listComments } from "@/lib/repositories/comment-repo";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

const createSchema = z.object({
  contentId: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

export async function GET(request: NextRequest) {
  const contentId = request.nextUrl.searchParams.get("contentId");
  if (!contentId) {
    return NextResponse.json(
      { error: "contentId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const comments = await listComments(contentId, LIST_LIMIT);
    return NextResponse.json({ comments, count: comments.length });
  } catch (error) {
    console.error("[comments] list failed:", error);
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
    return NextResponse.json({ error: "Sign in to comment" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const content = await getContentById(parsed.data.contentId);
    if (!content || content.archived) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const comment = await createComment({
      contentId: parsed.data.contentId,
      userId: user.uid,
      userEmail: user.email ?? "unknown@aggronation.local",
      body: parsed.data.body,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("[comments] create failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
