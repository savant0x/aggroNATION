"use client";

/**
 * Comment section (FID-013; threading per FID-2026-0904-023 stream B).
 * Loads comments client-side (the watch page is ISR; comments must be live),
 * posts via the session-gated API, and lets users archive their own comments
 * (admins can archive any — server enforces). Replies render one level deep
 * under their parent (the API flattens reply-to-reply to the ancestor).
 * Emails are never rendered — display shows the email local-part only.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input, Label, TextField } from "@heroui/react";

interface CommentView {
  id: string;
  userId: string;
  userEmail: string;
  body: string;
  parentId: string | null;
  createdAt: string;
}

interface SessionView {
  user: {
    uid: string;
    email: string | null;
    isAdmin: boolean;
  } | null;
}

function displayName(email: string): string {
  const local = email.split("@")[0];
  return local.length > 0 ? local : "user";
}

export function CommentSection({ contentId }: { contentId: string }) {
  const [comments, setComments] = useState<CommentView[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState<SessionView["user"]>(null);
  // Bumped after post/delete to re-run the load effect (event-handler state
  // updates are the sanctioned way to refetch — no setState-in-effect).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      try {
        const response = await fetch(
          `/api/comments?contentId=${encodeURIComponent(contentId)}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load comments (${response.status})`);
        }
        const data = (await response.json()) as { comments: CommentView[] };
        if (!cancelled) {
          setComments(data.comments);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) {
          setLoadState("error");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [contentId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function probe(): Promise<void> {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = (await response.json()) as SessionView;
        if (!cancelled) {
          setSession(data.user);
        }
      } catch {
        // Session probe failure just means signed-out UI.
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  // Thread assembly: top-level comments newest-first, replies (oldest-first)
  // nested under their parent. Orphaned replies (archived parent) surface
  // top-level rather than vanishing — nothing a user wrote silently dies.
  const threads = useMemo(() => {
    const tops = comments
      .filter((c) => c.parentId === null)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    const byParent = new Map<string, CommentView[]>();
    for (const c of comments) {
      if (c.parentId !== null) {
        const bucket = byParent.get(c.parentId);
        if (bucket) {
          bucket.push(c);
        } else {
          byParent.set(c.parentId, [c]);
        }
      }
    }
    const orphans = comments.filter(
      (c) => c.parentId !== null && !comments.some((p) => p.id === c.parentId),
    );
    return { tops, byParent, orphans };
  }, [comments]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError("Comment can't be empty.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          body: trimmed,
          ...(replyTo ? { parentId: replyTo.id } : {}),
        }),
      });
      if (response.status === 401) {
        setError("Your session expired — sign in again to comment.");
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Post failed (${response.status})`);
      }
      setBody("");
      setReplyTo(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(commentId: string): Promise<void> {
    setError(null);
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Delete failed (${response.status})`);
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function commentMeta(comment: CommentView) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {displayName(comment.userEmail)}
          {session?.uid === comment.userId && (
            <span className="ml-2 text-xs text-muted">(you)</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <time dateTime={comment.createdAt} className="text-xs text-muted">
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
            }).format(new Date(comment.createdAt))}
          </time>
          {session && (
            <button
              type="button"
              onClick={() => {
                setReplyTo(comment);
                setBody("");
                setError(null);
              }}
              aria-label="Reply to comment"
              className="text-xs text-muted hover:text-accent"
            >
              reply
            </button>
          )}
          {(session?.isAdmin || session?.uid === comment.userId) && (
            <button
              type="button"
              onClick={() => handleDelete(comment.id)}
              aria-label="Delete comment"
              className="text-xs text-red-400 hover:underline"
            >
              delete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
        Comments {loadState === "ready" && `(${comments.length})`}
      </h2>

      {session ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TextField name="comment">
            <Label>
              {replyTo
                ? `Replying to ${displayName(replyTo.userEmail)}`
                : "Add a comment"}
            </Label>
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={replyTo ? "Write your reply…" : "Share your take…"}
              maxLength={2000}
            />
          </TextField>
          {replyTo && (
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="w-fit text-xs text-muted hover:text-accent"
            >
              cancel reply
            </button>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <div>
            <Button
              type="submit"
              isDisabled={isSubmitting || body.trim().length === 0}
              className="glow-accent rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] px-5 font-medium text-white"
            >
              {isSubmitting ? "Posting…" : replyTo ? "Reply" : "Comment"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--color-edge)] px-4 py-3 text-sm text-muted">
          <Link href="/login" className="underline hover:text-accent">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      {loadState === "error" && (
        <p role="alert" className="text-sm text-red-400">
          Comments failed to load — try refreshing.
        </p>
      )}

      {loadState === "ready" && comments.length === 0 && (
        <p className="text-sm text-muted">No comments yet — be the first.</p>
      )}

      <ul className="flex flex-col gap-3">
        {[...threads.tops, ...threads.orphans].map((comment) => {
          const replies = (threads.byParent.get(comment.id) ?? []).sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          return (
            <li
              key={comment.id}
              className="flex flex-col gap-1 rounded-xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-3"
            >
              {commentMeta(comment)}
              <p className="whitespace-pre-line text-sm text-[var(--color-text-primary)]">
                {comment.body}
              </p>
              {replies.length > 0 && (
                <ul className="ml-4 flex flex-col gap-2 border-l border-[var(--color-edge)] pl-4 pt-1">
                  {replies.map((reply) => (
                    <li key={reply.id} className="flex flex-col gap-1">
                      {commentMeta(reply)}
                      <p className="whitespace-pre-line text-sm text-[var(--color-text-primary)]">
                        {reply.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
