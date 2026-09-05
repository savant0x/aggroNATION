import type { Metadata } from "next";
import { ContentGrid } from "@/components/home/ContentGrid";
import { SEARCH_LIMIT, searchContent } from "@/lib/repositories/content-repo";
import type { ContentItem } from "@/lib/schemas/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  // Query URLs are unbounded permutations — keep crawlers on /search itself.
  robots: { index: false, follow: true },
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Search (rewritten FID-2026-0904-021): the Firestore-era newest-100
 * in-page filter is gone — queries run server-side across the entire
 * index (title / excerpt / author / tags, ilike), newest first, bounded
 * at SEARCH_LIMIT. Honest states for no query, no results, and query
 * failure; nothing is faked in between.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let results: ContentItem[] = [];
  let failed = false;
  if (query.length > 0) {
    try {
      results = await searchContent({ query, limit: SEARCH_LIMIT });
    } catch (error) {
      console.error("[/search] query failed:", error);
      failed = true;
    }
  }

  const hasQuery = query.length > 0;

  return (
    <div className="flex flex-col gap-6 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          Search
        </h1>
        <p className="max-w-2xl text-muted">
          {failed
            ? "The search query failed — check server logs. Nothing is faked."
            : hasQuery
              ? results.length > 0
                ? `${results.length} result${results.length === 1 ? "" : "s"} for “${query}” across the entire index${results.length === SEARCH_LIMIT ? ` (showing the first ${SEARCH_LIMIT})` : ""}.`
                : `Nothing matched “${query}”.`
              : "Search titles, descriptions, authors, and tags across the entire index."}
        </p>
      </header>

      <form action="/search" method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search content…"
          aria-label="Search content"
          className="h-11 w-full max-w-xl rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          className="glow-accent h-11 rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] px-6 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>

      {failed ? (
        <p role="alert" className="text-sm text-red-400">
          The search query failed — check server logs. Nothing is faked.
        </p>
      ) : hasQuery && results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-12 text-center">
          <p className="text-lg font-medium text-[var(--color-text-muted)]">
            Nothing matched “{query}”
          </p>
          <p className="mt-1 text-sm text-muted">
            The search covers every item in the index — try fewer or shorter
            words.
          </p>
        </div>
      ) : results.length > 0 ? (
        <ContentGrid items={results} />
      ) : null}
    </div>
  );
}
