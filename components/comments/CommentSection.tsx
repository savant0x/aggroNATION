"use client";

/**
 * Comment section (FID-013). Loads comments client-side (the watch page is
 * ISR; comments must be live), posts via the session-gated API, and lets
 * users archive their own comments (admins can archive any — server enforces).
 * Emails are never rendered — display shows the email local-part only.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Label, TextField } from "@heroui/react";

interface CommentView {
  id: string;
  userId: string;
  userEmail: string;
  body: string;
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
        body: JSON.stringify({ contentId, body: trimmed }),
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

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
        Comments {loadState === "ready" && `(${comments.length})`}
      </h2>

      {session ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TextField name="comment">
            <Label>Add a comment</Label>
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your take…"
              maxLength={2000}
            />
          </TextField>
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
              {isSubmitting ? "Posting…" : "Comment"}
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
        {comments.map((comment) => (
          <li
            key={comment.id}
            className="flex flex-col gap-1 rounded-xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {displayName(comment.userEmail)}
                {session?.uid === comment.userId && (
                  <span className="ml-2 text-xs text-muted">(you)</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <time
                  dateTime={comment.createdAt}
                  className="text-xs text-muted"
                >
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                  }).format(new Date(comment.createdAt))}
                </time>
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
            <p className="whitespace-pre-line text-sm text-[var(--color-text-primary)]">
              {comment.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
