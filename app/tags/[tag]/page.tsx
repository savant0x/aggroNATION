import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentGrid } from "@/components/home/ContentGrid";
import { EmptyState } from "@/components/home/EmptyState";
import {
  countContentByTag,
  getContentByTag,
} from "@/lib/repositories/content-repo";

export const revalidate = 600;

const PAGE_SIZE = 40;

interface TagPageProps {
  params: Promise<{ tag: string }>;
}

function decodeTag(raw: string): string | null {
  try {
    const tag = decodeURIComponent(raw).trim();
    // One sanity gate: printable, sane length, no path tricks.
    if (tag.length === 0 || tag.length > 64 || /[/\\%]/.test(tag)) {
      return null;
    }
    return tag;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { tag: raw } = await params;
  const tag = decodeTag(raw);
  return {
    title: tag ? `${tag} — Topics` : "Topic",
    robots: { index: tag !== null, follow: true },
  };
}

/**
 * Tag/topic listing (FID-2026-0904-023 stream G) — every item carrying the
 * tag, newest first, ISR-cached per path. The site's topic-hub surface:
 * GitHub topics, RSS categories, and HF tags all land here.
 */
export default async function TagPage({ params }: TagPageProps) {
  const { tag: raw } = await params;
  const tag = decodeTag(raw);
  if (tag === null) {
    notFound();
  }

  let items: Awaited<ReturnType<typeof getContentByTag>> = [];
  let total: number | null = null;
  let failed = false;
  try {
    [items, total] = await Promise.all([
      getContentByTag({ tag, limit: PAGE_SIZE, offset: 0 }),
      countContentByTag(tag),
    ]);
  } catch (error) {
    console.error(`[/tags/${tag}] load failed:`, error);
    failed = true;
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--color-accent-bright)]"
        >
          ← Back to home
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          #{tag}
        </h1>
        <p className="max-w-2xl text-muted">
          {total !== null
            ? `${total.toLocaleString("en")} item${total === 1 ? "" : "s"} tagged “${tag}” across every source.`
            : `Items tagged “${tag}” across every source.`}
        </p>
      </header>

      {failed ? (
        <p role="alert" className="text-sm text-red-400">
          The tag query failed — check server logs. Nothing is faked.
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          sourceType={`#${tag}`}
          detailOverride="Nothing carries this tag yet — topics fill in as the pipelines fetch."
        />
      ) : (
        <ContentGrid items={items} />
      )}
    </div>
  );
}
