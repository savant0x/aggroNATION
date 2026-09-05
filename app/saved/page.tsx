import type { Metadata } from "next";
import Link from "next/link";

import { ContentGrid } from "@/components/home/ContentGrid";
import { EmptyState } from "@/components/home/EmptyState";
import { getCurrentUser } from "@/lib/auth/session";
import { listBookmarks } from "@/lib/repositories/engagement-repo";
import { getContentById } from "@/lib/repositories/content-repo";
import type { ContentItem } from "@/lib/schemas/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved",
  robots: { index: false, follow: false },
};

/**
 * Reading list (FID-2026-0904-023 stream A) — the signed-in user's
 * bookmarks, newest-save first. Private surface: session-gated, noindex.
 */
export default async function SavedPage() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }

  let items: ContentItem[] = [];
  let failed = false;
  if (user) {
    try {
      const bookmarks = await listBookmarks(user.uid, 500);
      const resolved = await Promise.all(
        bookmarks.map(async (b) => {
          try {
            return await getContentById(b.contentId);
          } catch {
            return null;
          }
        }),
      );
      items = resolved.filter(
        (i): i is ContentItem => i !== null && !i.archived,
      );
    } catch (error) {
      console.error("[/saved] load failed:", error);
      failed = true;
    }
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          Saved
        </h1>
        <p className="max-w-2xl text-muted">
          Your reading list — private to your account.
        </p>
      </header>

      {!user ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-12 text-center">
          <p className="text-lg font-medium text-[var(--color-text-muted)]">
            Sign in to keep a reading list.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] px-6 text-sm font-medium text-white"
          >
            Sign in
          </Link>
        </div>
      ) : failed ? (
        <p role="alert" className="text-sm text-red-400">
          The bookmarks query failed — check server logs. Nothing is faked.
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          sourceType="Saved"
          detailOverride="Tap ☆ Save on any article or video — it lands here."
        />
      ) : (
        <ContentGrid items={items} />
      )}
    </div>
  );
}
