/**
 * Comment repository (FID-013, migrated to Supabase per FID-2026-0904-010) —
 * the ONLY module that reads/writes the `comments` table. Append-only;
 * moderation is a soft archive so abuse reports keep an audit trail.
 */

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { commentSchema, type Comment } from "@/lib/schemas/content";

const COMMENTS_TABLE = "comments";

interface CommentRow {
  id: string;
  content_id: string;
  user_id: string;
  user_email: string;
  body: string;
  parent_id: string | null;
  archived: boolean;
  created_at: string;
}

function mapCommentRow(row: CommentRow): Comment {
  return commentSchema.parse({
    id: row.id,
    contentId: row.content_id,
    userId: row.user_id,
    userEmail: row.user_email,
    body: row.body,
    parentId: row.parent_id,
    archived: row.archived,
    createdAt: new Date(row.created_at),
  });
}

export async function listComments(
  contentId: string,
  limit: number,
): Promise<Comment[]> {
  const { data, error } = await getServiceClient()
    .from(COMMENTS_TABLE)
    .select("*")
    .eq("content_id", contentId)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`listComments failed: ${error.message}`);
  }
  return (data ?? []).map((r) => mapCommentRow(r as CommentRow));
}

export interface CreateCommentInput {
  contentId: string;
  userId: string;
  userEmail: string;
  body: string;
  /** Parent comment id for replies (stream B). */
  parentId?: string | null;
}

export async function createComment(
  input: CreateCommentInput,
): Promise<Comment> {
  // Validate before anything touches the DB — invalid shapes never land.
  const parsed = commentSchema.parse({
    id: "pending",
    contentId: input.contentId,
    userId: input.userId,
    userEmail: input.userEmail,
    body: input.body.trim(),
    parentId: input.parentId ?? null,
    archived: false,
    createdAt: new Date(),
  });

  const { data, error } = await getServiceClient()
    .from(COMMENTS_TABLE)
    .insert({
      content_id: parsed.contentId,
      user_id: parsed.userId,
      user_email: parsed.userEmail,
      body: parsed.body,
      parent_id: parsed.parentId,
      archived: false,
      created_at: parsed.createdAt.toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(`createComment failed: ${error.message}`);
  }
  return mapCommentRow(data as CommentRow);
}

/** Soft moderation delete — archived comments drop out of all list queries. */
export async function archiveComment(commentId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from(COMMENTS_TABLE)
    .update({ archived: true })
    .eq("id", commentId);
  if (error) {
    throw new Error(`archiveComment failed: ${error.message}`);
  }
}

export async function getCommentById(
  commentId: string,
): Promise<Comment | null> {
  const { data, error } = await getServiceClient()
    .from(COMMENTS_TABLE)
    .select("*")
    .eq("id", commentId)
    .maybeSingle();
  if (error) {
    throw new Error(`getCommentById failed: ${error.message}`);
  }
  return data ? mapCommentRow(data as CommentRow) : null;
}
