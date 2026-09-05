import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentById } from "@/lib/repositories/content-repo";
import { buildContentDocId } from "@/lib/schemas/content";
import { CommentSection } from "@/components/comments/CommentSection";
import { siteConfig } from "@/config/site";
import { ogImageUrl } from "@/lib/og";

// Watch pages share the ISR freshness contract with the grids.
export const revalidate = 300;

// FID-2026-0904-012 item 5: runtime-ISR opt-in for the dynamic route (empty
// GSP = prerender nothing at build, cache per-path on first request).
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ videoId: string }>;
}): Promise<Metadata> {
  const { videoId } = await params;
  if (!/^[A-Za-z0-9_-]+$/.test(videoId)) {
    return { title: "Watch" };
  }
  try {
    const item = await getContentById(buildContentDocId("youtube", videoId));
    if (!item) {
      return { title: "Video not found" };
    }
    // FID-2026-0904-012 item 2: YouTube thumbnail as the social image.
    const ogUrl = `${siteConfig.url}/watch/${videoId}`;
    // FID-2026-0904-022 stream B: generated card for shares (always renders).
    const image = ogImageUrl(item);
    return {
      title: item.title,
      description: item.excerpt,
      alternates: { canonical: ogUrl },
      openGraph: {
        type: "video.other",
        url: ogUrl,
        title: item.title,
        description: item.excerpt,
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
    return { title: "Watch" };
  }
}

interface WatchPageProps {
  params: Promise<{ videoId: string }>;
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { videoId } = await params;

  // Route param charset guard — mirrors the id charset used by
  // buildContentDocId so the doc lookup can only hit a well-formed id.
  if (!/^[A-Za-z0-9_-]+$/.test(videoId)) {
    // Real 404, not a soft-404 panel (FID-2026-0904-012 item 3).
    notFound();
  }

  const contentId = buildContentDocId("youtube", videoId);
  let item = null;
  try {
    item = await getContentById(contentId);
  } catch (error) {
    console.error("[/watch] content lookup failed:", error);
    // Lookup FAILED — a 500-class condition must not masquerade as 404.
    return <WatchNotFound />;
  }

  if (!item) {
    // Genuinely missing — real 404.
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-20 pt-8">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-[var(--color-edge)] bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`}
          title={item.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-snug md:text-3xl">
          {item.title}
        </h1>
        <p className="text-sm text-muted">
          {item.author || "Unknown"} ·{" "}
          {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
            item.publishedAt,
          )}{" "}
          · {item.metrics.views.toLocaleString("en")} views ·{" "}
          {item.metrics.likes.toLocaleString("en")} likes ·{" "}
          {item.metrics.comments.toLocaleString("en")} comments on YouTube
        </p>
      </div>

      {item.excerpt && (
        <section className="rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)] p-5">
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold">
            Description
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
            {item.excerpt}
          </p>
        </section>
      )}

      <CommentSection contentId={contentId} />
    </div>
  );
}

/** 500-class panel: lookup FAILED (not missing) — honest no-fake contract. */
function WatchNotFound() {
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
        href="/youtube"
        className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
      >
        Browse YouTube content
      </Link>
    </div>
  );
}
