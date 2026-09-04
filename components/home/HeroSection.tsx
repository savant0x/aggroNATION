/**
 * Hero (FID-021 rev 3): the operator banner alone, at its natural aspect
 * ratio — the image carries the branding; nothing rendered over it.
 *
 * FID-2026-0904-002: the flat image gained the site's glow language — an
 * accent bloom halo behind the banner (theme-tuned: stronger in dark, softer
 * in light) and mirrored gradient edges top and bottom.
 */
export function HeroSection() {
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
      </div>
    </section>
  );
}
