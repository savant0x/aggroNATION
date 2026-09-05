import type { Metadata } from "next";
import Link from "next/link";

import { getStatusSnapshot } from "@/lib/repositories/cycle-repo";
import { relativeTime } from "@/lib/format/relative-time";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Status",
  description:
    "Engine heartbeat for aggroNATION — last fetch cycle, per-source health, and recent ingestion runs.",
};

/**
 * Public engine status (FID-2026-0905-002 stream A): the ingestion
 * pipeline's own heartbeat, rendered from the fetch_cycles log. Nothing is
 * faked — before the first recorded cycle the page says so honestly, and a
 * gap in the log shows as a gap, not as a green dot.
 */
export default async function StatusPage() {
  let snapshot: Awaited<ReturnType<typeof getStatusSnapshot>> | null = null;
  let failed = false;
  try {
    snapshot = await getStatusSnapshot();
  } catch (error) {
    console.error("[/status] load failed:", error);
    failed = true;
  }

  const last = snapshot?.lastCycle ?? null;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-8 pb-20 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight">
          Status
        </h1>
        <p className="max-w-2xl text-muted">
          The ingestion engine runs hourly. This page is its heartbeat — real
          records from the pipeline, never a synthetic green dot.
        </p>
      </header>

      {failed ? (
        <p role="alert" className="text-sm text-red-400">
          The status query failed — check server logs. Nothing is faked.
        </p>
      ) : !last ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-12 text-center">
          <p className="text-lg font-medium text-[var(--color-text-muted)]">
            No cycle recorded yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            The next fetch (hourly, or triggered from the admin dashboard) will
            land the first record. Nothing is faked in the meantime.
          </p>
        </div>
      ) : (
        <>
          <section
            aria-label="Engine heartbeat"
            className="flex flex-col gap-3"
          >
            <h2 className="text-lg font-semibold">Heartbeat</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Last cycle"
                value={relativeTime(last.ranAt)}
                tone={last.failed === 0 ? "ok" : "warn"}
              />
              <Stat
                label="Sources OK"
                value={`${last.succeeded}/${last.totalSources}`}
                tone={last.failed === 0 ? "ok" : "warn"}
              />
              <Stat
                label="Items fetched"
                value={last.itemsFetched.toLocaleString("en")}
              />
              <Stat
                label="Duration"
                value={`${(last.durationMs / 1000).toFixed(1)}s`}
              />
            </div>
          </section>

          <section
            aria-label="Per-source health"
            className="flex flex-col gap-3"
          >
            <h2 className="text-lg font-semibold">Sources</h2>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-edge)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface)] text-left text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Last run</th>
                    <th className="px-4 py-2 font-medium">Result</th>
                    <th className="px-4 py-2 font-medium">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot!.sources.map((s) => (
                    <tr
                      key={s.sourceId || s.sourceName}
                      className="border-t border-[var(--color-edge)]"
                    >
                      <td className="px-4 py-2">
                        <span className="font-medium">{s.sourceName}</span>
                        <span className="ml-2 text-xs text-muted">
                          {s.sourceType}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {s.lastRanAt ? relativeTime(s.lastRanAt) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {s.ok === null ? (
                          <span className="text-muted">unknown</span>
                        ) : s.ok ? (
                          <span className="font-medium text-emerald-400">
                            OK
                          </span>
                        ) : (
                          <span
                            className="font-medium text-red-400"
                            title={s.error ?? undefined}
                          >
                            FAIL
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">{s.itemsFetched}</td>
                    </tr>
                  ))}
                  {snapshot!.sources.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-4 text-center text-muted"
                      >
                        No source outcomes recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-label="Recent cycles" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Recent cycles</h2>
            <ol className="flex flex-col gap-1.5">
              {snapshot!.recent.slice(0, 24).map((c) => (
                <li
                  key={c.ranAt.toISOString()}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-2 text-sm"
                >
                  <span
                    aria-hidden
                    className={
                      c.failed === 0
                        ? "h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                        : "h-2 w-2 shrink-0 rounded-full bg-amber-400"
                    }
                  />
                  <span className="text-muted">{relativeTime(c.ranAt)}</span>
                  <span>
                    {c.succeeded}/{c.totalSources} sources
                  </span>
                  <span className="text-muted">{c.itemsFetched} items</span>
                  {c.failed > 0 && (
                    <span className="text-amber-400">{c.failed} failed</span>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <p className="text-xs text-muted">
            Machine-readable snapshot:{" "}
            <Link
              href="/api/status"
              className="underline hover:text-[var(--color-accent-bright)]"
            >
              /api/status
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 font-[family-name:var(--font-display)] text-xl font-bold ${
          tone === "warn"
            ? "text-amber-400"
            : tone === "ok"
              ? "text-emerald-400"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
