/**
 * Source-identity pill (FID-2026-0904-007) — overlaid on the card thumbnail
 * so diversified sections (FID-2026-0904-006) visibly show which feed each
 * item came from. Quiet by design: 10px uppercase, translucent dark plate,
 * stays out of the thumbnail's way. Hidden entirely when the doc predates
 * the backfill (sourceName null) — no placeholder guessing.
 */
interface SourceBadgeProps {
  name: string | null;
}

export function SourceBadge({ name }: SourceBadgeProps) {
  if (!name) return null;

  return (
    <span
      className="absolute left-2.5 top-2.5 z-10 max-w-[75%] truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white/90 backdrop-blur-sm"
      title={`From ${name}`}
    >
      {name}
    </span>
  );
}
