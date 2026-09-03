import Link from "next/link";

interface HeroSectionProps {
  topItemTitle?: string;
}

export function HeroSection({ topItemTitle }: HeroSectionProps) {
  return (
    <section className="relative -mx-6 overflow-hidden px-6 py-20 md:py-28">
      {/* Decorative background layers */}
      <div aria-hidden="true" className="grid-texture absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-64 w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--color-accent) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-1.5 text-xs text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent-bright)]" />
          AI content aggregation, automated hourly
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          The signal, <span className="gradient-text">aggregated</span>
        </h1>

        <p className="max-w-xl text-lg text-muted">
          aggroNATION pulls the best AI content from YouTube, RSS, Reddit and X
          — ranked by engagement, freshened hourly, no algorithm chasing you.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/youtube"
            className="glow-accent rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] px-6 py-2.5 font-medium text-white transition-transform hover:scale-[1.02]"
          >
            Browse YouTube
          </Link>
          <Link
            href="/about"
            className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-6 py-2.5 font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent)]"
          >
            How it works
          </Link>
        </div>

        {topItemTitle && (
          <p className="pt-4 text-sm text-muted">
            🔥 Top rated right now:{" "}
            <span className="text-[var(--color-text-primary)]">
              {topItemTitle}
            </span>
          </p>
        )}
      </div>
      <div className="gradient-line absolute inset-x-0 bottom-0 h-px opacity-40" />
    </section>
  );
}
