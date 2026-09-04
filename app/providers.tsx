"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";

/**
 * App-level client providers (FID-010). The theme provider is owned
 * in-repo — no third-party script-in-tree provider — per FID-010.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
