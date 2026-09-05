import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentGrid } from "@/components/home/ContentGrid";
import { GitHubRepoCard } from "@/components/article/GitHubRepoCard";
import { EmptyState } from "@/components/home/EmptyState";
import { getContentRepoItems } from "@/lib/repositories/content-repo";

export const revalidate = 600;

interface RepoPageProps {
  params: Promise<{ slug: string }>;
}

/** `/repo/owner--name` — slug sanity: owner/name shape, no path tricks. */
function decodeSlug(raw: string): string | null {
  try {
    const slug = decodeURIComponent(raw).trim();
    if (!/^[A-Za-z0-9_.-]+--[A-Za-z0-9_.-]+$/.test(slug)) {
      return null;
    }
    return slug.replace("--", "/");
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: RepoPageProps): Promise<Metadata> {
  const { slug: raw } = await params;
  const slug = decodeSlug(raw);
  return {
    title: slug ? `${slug} — Repository` : "Repository",
    robots: { index: slug !== null, follow: true },
  };
}

/**
 * Repo entity page (FID-2026-0904-023 stream J) — the same repository
 * arrives via trendshift, opensourceprojects, and RSS discussions; this
 * page deduplicates the view: the repo card once, every mention listed.
 */
export default async function RepoPage({ params }: RepoPageProps) {
  const { slug: raw } = await params;
  const slug = decodeSlug(raw);
  if (slug === null) {
    notFound();
  }

  let items: Awaited<ReturnType<typeof getContentRepoItems>> = [];
  let failed = false;
  try {
    items = await getContentRepoItems({ slug, limit: 100 });
  } catch (error) {
    console.error(`[/repo/${slug}] load failed:`, error);
    failed = true;
  }

  const github = items.find((item) => item.github)?.github ?? null;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/github"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--color-accent-bright)]"
        >
          ← GitHub
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          {slug}
        </h1>
        <p className="max-w-2xl text-muted">
          Every mention of this repository across all aggroNATION sources — one
          page, deduplicated.
        </p>
      </header>

      {failed ? (
        <p role="alert" className="text-sm text-red-400">
          The repo query failed — check server logs. Nothing is faked.
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          sourceType={slug}
          detailOverride="No indexed mentions of this repository yet."
        />
      ) : (
        <>
          {github && (
            <section aria-label="Repository card">
              <div className="max-w-2xl">
                <GitHubRepoCard github={github} />
              </div>
            </section>
          )}
          <section aria-label="Mentions" className="flex flex-col gap-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
              Mentions ({items.length})
            </h2>
            <ContentGrid items={items} />
          </section>
        </>
      )}
    </div>
  );
}
