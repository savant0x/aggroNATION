import Link from "next/link";
import type { Metadata } from "next";

import { getContentById } from "@/lib/repositories/content-repo";
import { buildContentDocId } from "@/lib/schemas/content";
import { CommentSection } from "@/components/comments/CommentSection";

// Watch pages share the ISR freshness contract with the grids.
export const revalidate = 300;

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
    return { title: item?.title ?? "Watch" };
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
    return <WatchNotFound />;
  }

  const contentId = buildContentDocId("youtube", videoId);
  let item = null;
  let failed = false;
  try {
    item = await getContentById(contentId);
  } catch (error) {
    console.error("[/watch] content lookup failed:", error);
    failed = true;
  }

  if (!item) {
    return <WatchNotFound failed={failed} />;
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

function WatchNotFound({ failed = false }: { failed?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
        {failed ? "Something went wrong" : "Video not found"}
      </h1>
      <p className="max-w-md text-muted">
        {failed
          ? "The content lookup failed — check server logs. Nothing is faked in the meantime."
          : "This video isn't in the aggregation index. It may not have been fetched yet, or the link is malformed."}
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
