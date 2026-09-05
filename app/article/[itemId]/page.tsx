import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentById } from "@/lib/repositories/content-repo";
import { fetchArticle } from "@/lib/fetchers/article";
import { isMetadataTemplate } from "@/lib/fetchers/rss";
import { CommentSection } from "@/components/comments/CommentSection";
import { GitHubRepoCard } from "@/components/article/GitHubRepoCard";
import { SaveButton } from "@/components/engagement/SaveButton";
import { ReactionBar } from "@/components/engagement/ReactionBar";
import { ShareButton } from "@/components/engagement/ShareButton";
import { ReadingProgress } from "@/components/engagement/ReadingProgress";
import { RelatedItems } from "@/components/article/RelatedItems";
import { siteConfig } from "@/config/site";
import { ogImageUrl } from "@/lib/og";
import type { SourceType } from "@/lib/schemas/content";

// ISR 300s (FID-2026-0904-011): bounds the per-view origin scrape (FID-019/020
// fallback path) to at most once per 5 minutes per article; stored feed
// content renders instantly from the cache regardless. Comments stay live —
// they load client-side through /api/comments, never server-rendered.
export const revalidate = 300;

// FID-2026-0904-012 item 5: dynamic routes in Next 16 render dynamically at
// runtime unless they opt into the runtime-ISR contract. An empty-return GSP
// means "nothing to prerender at build; cache per-path on first request"
// (mechanism proven by controlled experiment in the FID, E3).
export function generateStaticParams() {
  return [];
}

/**
 * Text content types the reader serves (FID-022; x removed per
 * FID-2026-0904-004, trendshift added per FID-2026-0904-003, opensource per
 * FID-2026-0904-009). YouTube is excluded — it has the dedicated /watch page;
 * the no-exit law routes everything else through this in-site reader.
 */
const READABLE_TYPES: readonly SourceType[] = [
  "rss",
  "reddit",
  "huggingface",
  "trendshift",
  "opensource",
];
const READABLE_PREFIXES = READABLE_TYPES.map((t) => `${t}_`);

interface ArticlePageProps {
  params: Promise<{ itemId: string }>;
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { itemId } = await params;
  if (!READABLE_PREFIXES.some((p) => itemId.startsWith(p))) {
    return { title: "Article" };
  }
  try {
    const item = await getContentById(itemId);
    if (!item) {
      return { title: "Article not found" };
    }
    // FID-2026-0904-012 item 2: full social metadata — og:image priority
    // github card → feed thumbnail → site banner; excerpt as description;
    // large card for X/Discord/Slack link previews.
    // FID-2026-0904-022 stream B: the generated aggroNATION card replaces
    // remote thumbnails in social metadata — it always renders (no 429s, no
    // CSP host churn). The thumbnail stays on-site; this is share-only.
    const image = ogImageUrl(item);
    const ogUrl = `${siteConfig.url}/article/${itemId}`;
    return {
      title: item.title,
      description: item.excerpt,
      alternates: { canonical: ogUrl },
      openGraph: {
        type: "article",
        url: ogUrl,
        title: item.title,
        description: item.excerpt,
        publishedTime: item.publishedAt.toISOString(),
        authors: item.author ? [item.author] : undefined,
        images: [{ url: image }],
      },
      twitter: {
        card: "summary_large_image",
        title: item.title,
        description: item.excerpt,
        images: [image],
      },
    };
  } catch {
    return { title: "Article" };
  }
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { itemId } = await params;

  // Doc ids are `{sourceType}_{sanitized externalId}` (buildContentDocId) —
  // the route serves reader content for every TEXT content type (FID-022:
  // rss, reddit, x, huggingface). YouTube has its own watch page; everything
  // else reads here, on-site.
  if (
    !READABLE_PREFIXES.some((p) => itemId.startsWith(p)) ||
    itemId.length > 300
  ) {
    // Real 404, not a soft-404 panel (FID-2026-0904-012 item 3).
    notFound();
  }

  let item = null;
  try {
    const candidate = await getContentById(itemId);
    if (candidate && candidate.sourceType !== "youtube") {
      item = candidate;
    }
  } catch (error) {
    console.error("[/article] content lookup failed:", error);
    // Lookup FAILED — a 500-class condition must not masquerade as 404.
    // Honest no-fake contract: say so, don't render an empty page.
    return <ArticleNotFound />;
  }

  if (!item) {
    // Genuinely missing (or a youtube item) — real 404.
    notFound();
  }

  // FID-020 content-first order:
  //   1. contentHtml stored from the feed at fetch time (sanitized at fetch,
  //      re-sanitized at render — defense in depth). No remote request.
  //   2. Live scrape of the source page (also sanitized).
  //   3. Excerpt + honest note.
  // The publisher syndicated the body for exactly this purpose; scraping is
  // the fallback, not the primary source.
  let bodyHtml: string | null = item.contentHtml ?? null;
  // FID-2026-0904-023 stream E: reading time from the plain-text twin when
  // present, else derived from the sanitized body length heuristically.
  const readingMinutes =
    bodyHtml !== null
      ? Math.max(
          1,
          Math.round(
            bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).length / 220,
          ),
        )
      : null;
  let source = bodyHtml ? "feed" : null;
  let scrapeError: string | null = null;

  // FID-2026-0904-017: legacy rows may hold aggregator metadata templates
  // ("Article URL: … Comments URL: … Points: N") stored before the fetcher
  // learned to reject them. Never render that as content — treat it as
  // absent so the scrape/excerpt path takes over.
  if (bodyHtml && isMetadataTemplate(bodyHtml)) {
    bodyHtml = null;
    source = null;
  }

  if (!bodyHtml) {
    try {
      const article = await fetchArticle(item.url);
      if (article.sufficient) {
        bodyHtml = article.html;
        source = "scrape";
      } else {
        scrapeError = "the source page exposes little readable text";
      }
    } catch (error) {
      scrapeError = error instanceof Error ? error.message : String(error);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-20 pt-8">
      <ReadingProgress />
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-snug md:text-3xl">
          {item.title}
        </h1>
        <p className="text-sm text-muted">
          {item.author || "Unknown"} ·{" "}
          {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
            item.publishedAt,
          )}
          {" · "}via{" "}
          {item.sourceType === "rss"
            ? "RSS"
            : item.sourceType === "opensource"
              ? "Open Source Projects"
              : item.sourceType}
          {readingMinutes !== null && ` · ${readingMinutes} min read`}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SaveButton contentId={item.id} />
          <ReactionBar contentId={item.id} />
          <ShareButton title={item.title} path={`/article/${item.id}`} />
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-full border border-[var(--color-edge)] px-4 text-xs text-muted transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
            >
              Open original ↗
            </a>
          )}
        </div>
      </header>

      {item.github && <GitHubRepoCard github={item.github} />}

      {bodyHtml ? (
        <article
          className="article-reader flex flex-col gap-4"
          // Sanitized twice: at fetch time (lib/fetchers/rss.ts) and again
          // here via the same allowlist contract. Anchors never survive —
          // the no-exit law holds in both paths.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : (
        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)] p-5">
          <p className="text-sm leading-relaxed text-muted">{item.excerpt}</p>
          <p role="alert" className="text-sm text-red-400">
            {`The full body isn't available (${
              scrapeError ?? "the feed didn't include article content"
            }). The excerpt above is everything the publisher syndicated; try again later.`}
          </p>
        </section>
      )}

      {source === "feed" && (
        <p className="text-xs text-muted">
          Rendered from the publisher&apos;s own feed content.
        </p>
      )}

      <RelatedItems contentId={item.id} currentPath={`/article/${item.id}`} />
      <CommentSection contentId={item.id} />
    </div>
  );
}

/** 500-class panel: lookup FAILED (not missing) — honest no-fake contract. */
function ArticleNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        Something went wrong
      </h1>
      <p className="max-w-md text-muted">
        The content lookup failed — check server logs. Nothing is faked in the
        meantime.
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
