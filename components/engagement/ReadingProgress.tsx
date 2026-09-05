"use client";

/**
 * Reading progress (FID-2026-0904-023 stream E) — a 2px accent bar fixed to
 * the viewport top, width = scroll fraction of the article. Passive scroll
 * listener; rAF-coalesced.
 */

import { useEffect, useRef, useState } from "react";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const ticking = useRef(false);

  useEffect(() => {
    function update(): void {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      setProgress(total > 0 ? Math.min(1, doc.scrollTop / total) : 0);
      ticking.current = false;
    }
    function onScroll(): void {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)]"
      style={{ transform: `scaleX(${progress})` }}
    />
  );
}
