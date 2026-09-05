"use client";

/**
 * Reaction bar (FID-2026-0904-023 stream C) — one "+" per user per item.
 * Count + state load on mount; signed-out visitors see the count with a
 * sign-in affordance rather than a dead button.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

export function ReactionBar({ contentId }: { contentId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const [anon, setAnon] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function probe(): Promise<void> {
      try {
        const response = await fetch(
          `/api/reactions?contentId=${encodeURIComponent(contentId)}`,
          { credentials: "same-origin" },
        );
        if (!cancelled && response.ok) {
          const data = (await response.json()) as {
            count: number;
            mine: boolean;
          };
          setCount(data.count);
          setMine(data.mine);
          setAnon(
            data.count === 0 &&
              !data.mine &&
              response.headers.get("x-anon") === "1",
          );
        }
      } catch {
        // Leave count null — the bar renders nothing rather than a fake 0.
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  async function toggle(): Promise<void> {
    const next = !mine;
    setMine(next);
    setCount((prev) => (prev === null ? prev : prev + (next ? 1 : -1)));
    try {
      const response = await fetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contentId, on: next }),
      });
      if (response.status === 401) {
        setAnon(true);
        setMine(false);
        return;
      }
      if (response.ok) {
        const data = (await response.json()) as {
          count: number;
          mine: boolean;
        };
        setCount(data.count);
        setMine(data.mine);
      } else {
        setMine(!next);
        setCount((prev) => (prev === null ? prev : prev + (next ? -1 : 1)));
      }
    } catch {
      setMine(!next);
      setCount((prev) => (prev === null ? prev : prev + (next ? -1 : 1)));
    }
  }

  if (count === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={mine}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-4 text-xs transition-colors ${
          mine
            ? "border-[var(--color-accent)] text-[var(--color-accent-bright)]"
            : "border-[var(--color-edge)] text-muted hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
        }`}
      >
        <span aria-hidden="true">＋</span> Insightful
      </button>
      <span className="text-xs text-muted">
        {count}
        {anon && (
          <>
            {" · "}
            <Link href="/login" className="underline hover:text-accent">
              sign in to react
            </Link>
          </>
        )}
      </span>
    </div>
  );
}
