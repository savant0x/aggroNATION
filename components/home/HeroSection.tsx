/**
 * Hero (FID-021 rev 3): the operator banner alone, at its natural aspect
 * ratio — the image carries the branding.
 *
 * FID-2026-0904-002: the flat image gained the site's glow language — an
 * accent bloom halo behind the banner (theme-tuned: stronger in dark, softer
 * in light) and mirrored gradient edges top and bottom.
 *
 * FID-2026-0904-016: a live-signal strip overlays the banner's lower edge —
 * the first viewport now *works* (item count, last cycle, pipeline count)
 * instead of being pure dead art. Server-rendered from the same live data
 * as the rest of the site; a failed query renders the honest failure line,
 * never faked numbers. Visually it continues the navbar's design language:
 * bare translucent strip, no boxes, one signal dot, hairline gradient rule.
 */

interface HeroSignal {
  itemCount: number | null;
  /** Precomputed with the shared relativeTime formatter. */
  lastCycleLabel: string;
  pipelineCount: number;
  failed: boolean;
}

export function HeroSection({ signal }: { signal?: HeroSignal }) {
  return (
    <section className="relative -mx-6 overflow-hidden">
      {/* The banner image carries the visible branding; the sr-only heading
          keeps an accessible page title for screen readers and crawlers. */}
      <h1 className="sr-only">aggroNATION — the signal, aggregated</h1>

      <div className="banner-glow relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/banner.jpg" alt="" className="h-auto w-full" />
        <div
          aria-hidden="true"
          className="gradient-line absolute inset-x-0 top-0 h-px opacity-60"
        />
        <div
          aria-hidden="true"
          className="gradient-line absolute inset-x-0 bottom-0 h-px opacity-60"
        />

        {signal && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-full bg-[var(--color-base)]/60 px-5 py-2 text-xs backdrop-blur-md">
              {signal.failed ? (
                <span className="text-muted">
                  live signal unavailable — check server logs
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="signal-dot block" />
                    <strong className="font-semibold text-[var(--color-text-primary)]">
                      {signal.itemCount !== null
                        ? signal.itemCount.toLocaleString("en")
                        : "—"}
                    </strong>
                    <span className="text-muted">items in the index</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-3 w-px bg-[var(--color-edge)]"
                  />
                  <span className="text-muted">
                    updated{" "}
                    <strong className="font-semibold text-[var(--color-text-primary)]">
                      {signal.lastCycleLabel}
                    </strong>
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-3 w-px bg-[var(--color-edge)]"
                  />
                  <span className="text-muted">
                    <strong className="font-semibold text-[var(--color-text-primary)]">
                      {signal.pipelineCount}
                    </strong>{" "}
                    live pipelines
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
