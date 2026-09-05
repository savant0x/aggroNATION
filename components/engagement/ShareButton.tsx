"use client";

/**
 * Share button (FID-2026-0904-023 stream F) — navigator.share when present,
 * clipboard copy otherwise; in-place confirmation, no alert().
 */

import { useState } from "react";

export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);

  async function share(): Promise<void> {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled the share sheet — nothing to do.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — fail quietly;
      // the URL bar remains the fallback.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-edge)] px-4 text-xs text-muted transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
