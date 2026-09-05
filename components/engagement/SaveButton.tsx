"use client";

/**
 * Save-to-reading-list button (FID-2026-0904-023 stream A). Probes the
 * session + bookmark state on mount; toggles via POST. Signed-out users see
 * a sign-in link (honest, no silent failure).
 */

import { useEffect, useState } from "react";
import Link from "next/link";

type SaveState = "loading" | "saved" | "unsaved" | "anon";

export function SaveButton({ contentId }: { contentId: string }) {
  const [state, setState] = useState<SaveState>("loading");

  useEffect(() => {
    let cancelled = false;
    async function probe(): Promise<void> {
      try {
        const response = await fetch(
          `/api/bookmarks?contentId=${encodeURIComponent(contentId)}`,
          { credentials: "same-origin" },
        );
        if (!cancelled) {
          if (response.status === 401) {
            setState("anon");
          } else if (response.ok) {
            const data = (await response.json()) as { saved: boolean };
            setState(data.saved ? "saved" : "unsaved");
          } else {
            setState("unsaved");
          }
        }
      } catch {
        if (!cancelled) {
          setState("unsaved");
        }
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  async function toggle(): Promise<void> {
    const next = state !== "saved";
    setState(next ? "saved" : "unsaved");
    try {
      const response = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contentId, saved: next }),
      });
      if (response.status === 401) {
        setState("anon");
        return;
      }
      if (!response.ok) {
        setState(next ? "unsaved" : "saved");
      }
    } catch {
      setState(next ? "unsaved" : "saved");
    }
  }

  if (state === "loading") {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-8 w-20 rounded-full border border-[var(--color-edge)] opacity-40"
      />
    );
  }

  if (state === "anon") {
    return (
      <Link
        href="/login"
        className="inline-flex h-8 items-center rounded-full border border-[var(--color-edge)] px-4 text-xs text-muted transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
      >
        Sign in to save
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state === "saved"}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-4 text-xs transition-colors ${
        state === "saved"
          ? "border-[var(--color-accent)] text-[var(--color-accent-bright)]"
          : "border-[var(--color-edge)] text-muted hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      {state === "saved" ? "★ Saved" : "☆ Save"}
    </button>
  );
}
