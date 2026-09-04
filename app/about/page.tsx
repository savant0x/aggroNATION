import { siteConfig } from "@/config/site";

export const metadata = {
  title: "About",
};

const SOURCES = [
  {
    name: "YouTube",
    status: "live",
    detail: "Curated channels via the YouTube Data API",
  },
  {
    name: "RSS",
    status: "live",
    detail: "Feed parsing + on-site article reading, same pipeline as YouTube",
  },
  {
    name: "Reddit",
    status: "live",
    detail: "Subreddit hot posts via reddit's official feeds, read on-site",
  },
  {
    name: "X (Twitter)",
    status: "live",
    detail:
      "Official API timelines — requires a bearer token; no scraping, ever",
  },
  {
    name: "HuggingFace",
    status: "live",
    detail: "Daily Papers with community upvotes feeding the ranking",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          About {siteConfig.name}
        </h1>
        <p className="text-lg text-muted">
          An AI content aggregator that surfaces the most engaging recent
          content from curated sources — ranked by an engagement + freshness
          score, refreshed automatically, with no algorithm chasing you.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          How ranking works
        </h2>
        <p className="text-muted">
          Every item gets a rating in the range 0–100: engagement × 0.6 +
          freshness × 0.4, where engagement blends likes and comments against
          views (comments weigh more — they cost more effort), and freshness
          decays over roughly two weeks. The score is a snapshot from fetch
          time; it is not influenced by what you click.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Sources
        </h2>
        <ul className="flex flex-col gap-2">
          {SOURCES.map((source) => (
            <li
              key={source.name}
              className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-edge)] bg-[var(--color-raised)] px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{source.name}</span>
                <span className="text-sm text-muted">{source.detail}</span>
              </div>
              <span
                className={
                  source.status === "live"
                    ? "shrink-0 rounded-full border border-[var(--color-accent-bright)] px-2 py-0.5 text-xs text-[var(--color-accent-bright)]"
                    : "shrink-0 rounded-full border border-[var(--color-edge)] px-2 py-0.5 text-xs text-muted"
                }
              >
                {source.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Content freshness
        </h2>
        <p className="text-muted">
          A scheduled job fetches every enabled source on its interval and
          writes results to the same pipeline — nothing on this site is
          hand-picked or faked. Video playback happens right here on the site;
          you are never shipped off to another platform to watch.
        </p>
      </section>
    </div>
  );
}
