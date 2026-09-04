import { ContentGrid } from "@/components/home/ContentGrid";
import { getLatestContentAllTypes } from "@/lib/repositories/content-repo";
import type { ContentItem } from "@/lib/schemas/content";

export const revalidate = 60;

export const metadata = {
  title: "Search",
};

const SEARCH_WINDOW = 100;

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Search (FID-015): Firestore has no native full-text search, so the query
 * loads the most recent window (100) and filters in-page by case-insensitive
 * substring across title / author / tags, best-rated first. Honest about the
 * window — a real search index (Typesense/Algolia) is the scaling upgrade.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  let pool: ContentItem[] = [];
  let failed = false;
  try {
    pool = await getLatestContentAllTypes({ limit: SEARCH_WINDOW });
  } catch (error) {
    console.error("[/search] load failed:", error);
    failed = true;
  }

  const results = query
    ? pool
        .filter((item) => {
          const haystack = [
            item.title,
            item.author,
            item.excerpt,
            item.tags.join(" "),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
        .sort((a, b) => b.metrics.rating - a.metrics.rating)
    : [];

  return (
    <div className="flex flex-col gap-6 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          Search
        </h1>
        <p className="max-w-2xl text-muted">
          {query
            ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}” across the ${pool.length} most recent items.`
            : `Search titles, authors, and tags across the ${pool.length} most recent items.`}
        </p>
      </header>

      <form action="/search" method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
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
          The content query failed — check server logs. Nothing is faked.
        </p>
      ) : query && results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-12 text-center">
          <p className="text-lg font-medium text-[var(--color-text-muted)]">
            Nothing matched “{q}”
          </p>
          <p className="mt-1 text-sm text-muted">
            The search covers the {SEARCH_WINDOW} most recent items — older
            content exists but isn&apos;t in the search window yet.
          </p>
        </div>
      ) : results.length > 0 ? (
        <ContentGrid items={results} />
      ) : null}
    </div>
  );
}
