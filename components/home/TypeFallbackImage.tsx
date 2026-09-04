import type { SourceType } from "@/lib/schemas/content";
import { TYPE_FALLBACK_IMAGE } from "@/config/type-visuals";
import { SourceBadge } from "@/components/home/SourceBadge";

interface TypeFallbackImageProps {
  sourceType: SourceType;
  /** FID-2026-0904-007: overlay the source badge (fallback images are generic
   * per-type, so the badge is the only per-item identity here). */
  withBadge?: boolean;
  sourceName?: string | null;
}

/**
 * Branded per-type card image (FID-2026-0904-001) — shared fallback used by
 * every content card when the item has no origin thumbnail (Law 13: one
 * implementation, two consumers). Visual treatment matches real thumbnails:
 * same aspect-video box, same hover zoom, so grids stay uniform.
 *
 * Types without a branded image (youtube; future types map to null) keep the
 * letter tile.
 */
export function TypeFallbackImage({
  sourceType,
  withBadge = false,
  sourceName = null,
}: TypeFallbackImageProps) {
  const src = TYPE_FALLBACK_IMAGE[sourceType];

  if (!src) {
    return (
      <div className="relative flex aspect-video w-full items-center justify-center bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-raised)]">
        {withBadge && <SourceBadge name={sourceName} />}
        <span className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--color-edge)]">
          {sourceType.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden">
      {/* Local static asset: plain img, same call as the other card images. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      {withBadge && <SourceBadge name={sourceName} />}
    </div>
  );
}
