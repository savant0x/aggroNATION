import Link from "next/link";
import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

/**
 * Root 404 (FID-2026-0904-012 item 3). Rendered for every notFound() throw
 * and unmatched route — styled and in-layout, unlike Next's unstyled default.
 */
export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        Page not found
      </h1>
      <p className="max-w-md text-muted">
        This page isn&apos;t in {siteConfig.name}. The link may be malformed, or
        the content may not have been fetched yet.
      </p>
      <Link
        href="/"
        className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
      >
        Back to home
      </Link>
    </div>
  );
}
