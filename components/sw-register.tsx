"use client";

/**
 * Registers the service worker (FID-2026-0904-023 stream M) — client-only,
 * production-only (a SW during development serves stale chunks and ruins
 * HMR). Registration failure is silently non-fatal: PWA is an enhancement,
 * never a requirement.
 */

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Enhancement failed — the site works fully without it.
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
