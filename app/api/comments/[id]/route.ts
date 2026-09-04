/**
 * Comment moderation (FID-013) — DELETE archives a comment (soft delete).
 * Author-self OR admin; everyone else gets 403. No hard deletes: archived
 * comments remain as an audit trail and drop out of list queries.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import {
  archiveComment,
  getCommentById,
} from "@/lib/repositories/comment-repo";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
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
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const comment = await getCommentById(id);
    if (!comment || comment.archived) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAuthor = comment.userId === user.uid;
    if (!isAuthor && !user.isAdmin) {
      return NextResponse.json(
        { error: "You can only delete your own comments" },
        { status: 403 },
      );
    }

    await archiveComment(id);
    return NextResponse.json({ ok: true, id, deleted: "archived" });
  } catch (error) {
    console.error("[comments/:id] delete failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
