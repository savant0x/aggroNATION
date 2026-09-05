/**
 * Engagement repository (FID-2026-0904-023 streams A+C) — the ONLY module
 * that reads/writes the `bookmarks` and `reactions` tables. Same contract as
 * comment-repo: service client here, session enforcement in the API layer.
 */

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";

const BOOKMARKS_TABLE = "bookmarks";
const REACTIONS_TABLE = "reactions";

export interface BookmarkRow {
  contentId: string;
  createdAt: Date;
}

export async function listBookmarks(
  userId: string,
  limit: number,
): Promise<BookmarkRow[]> {
  const { data, error } = await getServiceClient()
    .from(BOOKMARKS_TABLE)
    .select("content_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`listBookmarks failed: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    contentId: r.content_id as string,
    createdAt: new Date(r.created_at as string),
  }));
}

export async function isBookmarked(
  userId: string,
  contentId: string,
): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc("bookmark_exists", {
    p_user_id: userId,
    p_content_id: contentId,
  });
  if (error) {
    throw new Error(`isBookmarked failed: ${error.message}`);
  }
  return Boolean(data);
}

/** Toggle semantics decided by the caller; returns the resulting state. */
export async function setBookmark(
  userId: string,
  contentId: string,
  saved: boolean,
): Promise<boolean> {
  if (saved) {
    const { error } = await getServiceClient()
      .from(BOOKMARKS_TABLE)
      .upsert(
        { user_id: userId, content_id: contentId },
        { onConflict: "user_id,content_id" },
      );
    if (error) {
      throw new Error(`setBookmark(save) failed: ${error.message}`);
    }
    return true;
  }
  const { error } = await getServiceClient()
    .from(BOOKMARKS_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("content_id", contentId);
  if (error) {
    throw new Error(`setBookmark(unsave) failed: ${error.message}`);
  }
  return false;
}

export async function reactionCount(contentId: string): Promise<number> {
  const { count, error } = await getServiceClient()
    .from(REACTIONS_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("content_id", contentId);
  if (error) {
    throw new Error(`reactionCount failed: ${error.message}`);
  }
  return count ?? 0;
}

export async function hasReacted(
  userId: string,
  contentId: string,
): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc("reaction_exists", {
    p_user_id: userId,
    p_content_id: contentId,
  });
  if (error) {
    throw new Error(`hasReacted failed: ${error.message}`);
  }
  return Boolean(data);
}

/** Toggle semantics decided by the caller; returns the resulting state. */
export async function setReaction(
  userId: string,
  contentId: string,
  on: boolean,
): Promise<boolean> {
  if (on) {
    const { error } = await getServiceClient()
      .from(REACTIONS_TABLE)
      .upsert(
        { user_id: userId, content_id: contentId, kind: "+" },
        { onConflict: "user_id,content_id" },
      );
    if (error) {
      throw new Error(`setReaction(on) failed: ${error.message}`);
    }
    return true;
  }
  const { error } = await getServiceClient()
    .from(REACTIONS_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("content_id", contentId);
  if (error) {
    throw new Error(`setReaction(off) failed: ${error.message}`);
  }
  return false;
}
