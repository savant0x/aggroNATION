"use client";

/**
 * Owned theme provider (FID-010).
 *
 * Replaces next-themes, which renders an inline <script> inside the React
 * tree — React 19 refuses to execute scripts rendered client-side and logs a
 * console error on every client re-render of the provider tree (the FID-009
 * dashboard's router.refresh() triggered this repeatedly).
 *
 * Design:
 * - Module-level external store consumed via useSyncExternalStore (React's
 *   recommended pattern for exactly this) — no useState-in-effect, no
 *   hydration mismatch (server snapshot "dark" matches the server-rendered
 *   <html className="dark">).
 * - localStorage persistence ("aggronation-theme"), applied on mount and on
 *   change; DOM class + colorScheme kept in sync imperatively. React's vdom
 *   never renders the html className differently, so reconciliation never
 *   fights the mutation across re-renders/refreshes.
 * - First paint is dark for everyone (server-rendered default). Users with a
 *   stored "light" preference see it applied after hydration — a documented,
 *   deliberate tradeoff to keep scripts out of the React tree (FID-010).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "aggronation-theme";

let currentTheme: Theme = "dark";
const listeners = new Set<() => void>();

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Storage unavailable (private mode, permissions) — keep current theme.
  }
  return currentTheme;
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function persist(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Persistence is best-effort; the session theme still applies.
  }
}

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

/** Set the theme: store + DOM + persistence, then notify subscribers. */
export function setTheme(next: Theme): void {
  currentTheme = next;
  applyTheme(next);
  persist(next);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return "dark";
}

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // One-time mount sync: stored preference wins over the dark default.
  // Store mutation (not setState) drives the re-render — compliant with
  // react-hooks/set-state-in-effect by construction.
  useEffect(() => {
    const stored = readStoredTheme();
    if (stored !== currentTheme) {
      setTheme(stored);
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
