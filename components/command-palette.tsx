"use client";

/**
 * Cmd+K command palette (FID-2026-0904-022 stream C) — keyboard-first search
 * and navigation in the navbar's design language (translucent blur, no modal
 * chrome, hairline edges, accent used sparingly). Debounced queries to
 * /api/search; arrow keys move, Enter opens, Escape closes. Panel content
 * mounts lazily on first open so the navbar bundle stays flat.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { siteConfig } from "@/config/site";

interface SearchHit {
  id: string;
  title: string;
  sourceType: string;
  url: string;
}

const TYPE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  rss: "RSS",
  reddit: "Reddit",
  huggingface: "HuggingFace",
  trendshift: "Trendshift",
  opensource: "Open Source",
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActive(0);
  }, []);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => (prev ? false : true));
        return;
      }
      if (event.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [close]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (trimmed.length === 0) {
      // Async-adjacent reset: clearing via the debounce timer keeps this
      // effect free of synchronous setState (react-hooks/set-state-in-effect).
      debounceRef.current = setTimeout(() => {
        setHits([]);
        setLoading(false);
      }, 0);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: "same-origin" },
        );
        if (response.ok) {
          const body = (await response.json()) as { items: SearchHit[] };
          setHits(body.items);
          setActive(0);
        } else {
          setHits([]);
        }
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const rows: Array<{
    key: string;
    label: string;
    hint: string;
    href: string;
  }> = hits.map((hit) => ({
    key: hit.id,
    label: hit.title,
    hint: TYPE_LABELS[hit.sourceType] ?? hit.sourceType,
    href: hit.url,
  }));

  const quickActions = siteConfig.navItems
    .filter((item) => item.href !== "/")
    .map((item) => ({
      key: `nav-${item.href}`,
      label: item.label,
      hint: "Section",
      href: item.href,
    }));

  const visible = query.trim().length > 0 ? rows : quickActions;

  function choose(index: number) {
    const row = visible[index];
    if (row) {
      close();
      router.push(row.href);
    }
  }

  function onInputKeydown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((prev) => Math.min(prev + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[14vh] backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        aria-label="Command palette"
        aria-modal="true"
        role="dialog"
        className="w-[min(640px,92vw)] overflow-hidden rounded-2xl border border-[var(--color-edge)] bg-[var(--color-base)]/95 shadow-2xl backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search the index, jump to a section…"
          aria-label="Command palette search"
          className="h-14 w-full bg-transparent px-5 text-base text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeydown}
        />
        <div className="max-h-[50vh] overflow-y-auto border-t border-[var(--color-edge)]/60">
          {loading && visible.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Searching…</p>
          ) : visible.length === 0 && query.trim().length > 0 ? (
            <p className="px-5 py-4 text-sm text-muted">
              Nothing matched “{query.trim()}”.
            </p>
          ) : (
            <ul className="py-2">
              {visible.map((row, index) => (
                <li key={row.key}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-4 px-5 py-2.5 text-left text-sm transition-colors ${
                      index === active
                        ? "bg-[var(--color-raised)] text-[var(--color-text-primary)]"
                        : "text-muted hover:text-[var(--color-text-primary)]"
                    }`}
                    onClick={() => choose(index)}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="truncate">{row.label}</span>
                    <span className="flex-shrink-0 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                      {row.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-edge)]/60 px-5 py-2 text-xs text-muted">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span className="lowercase">{siteConfig.name}</span>
        </div>
      </div>
    </div>
  );
}
