import type { Metadata } from "next";
import Link from "next/link";

import { getStatusSnapshot } from "@/lib/repositories/cycle-repo";
import { getAllSources } from "@/lib/repositories/source-repo";
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
  let sources: Awaited<ReturnType<typeof getAllSources>> = [];
  let failed = false;
  try {
    [snapshot, sources] = await Promise.all([
      getStatusSnapshot(),
      getAllSources().catch(() => [] as never[]),
    ]);
  } catch (error) {
    console.error("[/status] load failed:", error);
    failed = true;
  }

  const last = snapshot?.lastCycle ?? null;

  // FID-2026-0905-005: merge LIVE tracker state (sources table: streak,
  // enabled, lastError) with HISTORICAL outcomes (cycle log). The merge is
  // why auto-disabled sources can no longer vanish from this page — they
  // produce no cycle outcomes, so only the live rows can show them.
  type MergedRow = {
    key: string;
    name: string;
    type: string;
    streak: number | null;
    enabled: boolean | null;
    ok: boolean | null;
    itemsFetched: number;
    error: string | null;
    lastRanAt: Date | null;
  };

  const liveById = new Map(
    Array.from(
      sources.filter((s) => !s.archived).map((s) => [s.id, s] as const),
    ),
  );
  const merged: MergedRow[] = [];
  for (const s of sources.filter((x) => !x.archived)) {
    const outcome = snapshot?.sources.find((o) => o.sourceId === s.id);
    merged.push({
      key: s.id,
      name: s.name,
      type: s.type,
      streak: s.metadata.consecutiveErrors,
      enabled: s.enabled,
      ok: outcome?.ok ?? null,
      itemsFetched: outcome?.itemsFetched ?? 0,
      error: outcome?.error ?? s.metadata.lastError ?? null,
      lastRanAt: outcome?.lastRanAt ?? s.metadata.lastFetchedAt ?? null,
    });
  }
  for (const o of snapshot?.sources ?? []) {
    const key = o.sourceId || o.sourceName;
    if (!liveById.has(o.sourceId) && !merged.some((m) => m.key === key)) {
      merged.push({
        key,
        name: o.sourceName,
        type: o.sourceType,
        streak: null,
        enabled: null,
        ok: o.ok,
        itemsFetched: o.itemsFetched,
        error: o.error,
        lastRanAt: o.lastRanAt,
      });
    }
  }
  merged.sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
  const autoDisabled = merged.filter((m) => m.enabled === false);

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
          </section>{" "}
          {autoDisabled.length > 0 && (
            <section
              aria-label="Auto-disabled sources"
              className="flex flex-col gap-2 rounded-2xl border border-red-500/40 bg-red-500/5 px-4 py-3"
            >
              <h2 className="text-lg font-semibold text-red-400">
                Auto-disabled ({autoDisabled.length})
              </h2>
              <p className="text-sm text-muted">
                These sources failed {""}
                {autoDisabled[0].streak ?? 5}+ consecutive fetches and were
                switched off by the failure tracker. Re-enable them from the
                admin dashboard once the underlying error is fixed.
              </p>
              <ul className="flex flex-wrap gap-2">
                {autoDisabled.map((m) => (
                  <li
                    key={m.key}
                    className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-medium text-red-400"
                    title={m.error ?? undefined}
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            </section>
          )}
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
                    <th
                      className="px-4 py-2 font-medium"
                      title="Consecutive fetch failures (the auto-disable tracker)"
                    >
                      Streak
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {merged.map((m) => (
                    <tr
                      key={m.key}
                      className="border-t border-[var(--color-edge)]"
                    >
                      <td className="px-4 py-2">
                        <span className="font-medium">{m.name}</span>
                        <span className="ml-2 text-xs text-muted">
                          {m.type}
                        </span>
                        {m.enabled === false && (
                          <span className="ml-2 rounded-full border border-red-500/40 px-2 py-0.5 text-[10px] font-medium text-red-400">
                            disabled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {m.lastRanAt ? relativeTime(m.lastRanAt) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {m.ok === null ? (
                          <span className="text-muted">unknown</span>
                        ) : m.ok ? (
                          <span className="font-medium text-emerald-400">
                            OK
                          </span>
                        ) : (
                          <span
                            className="font-medium text-red-400"
                            title={m.error ?? undefined}
                          >
                            FAIL
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">{m.itemsFetched}</td>
                      <td
                        className={`px-4 py-2 ${
                          (m.streak ?? 0) > 0
                            ? "font-medium text-amber-400"
                            : "text-muted"
                        }`}
                      >
                        {m.streak ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {merged.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
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
          <section
            aria-label="Items per cycle, last 48 cycles"
            className="flex flex-col gap-3"
          >
            <h2 className="text-lg font-semibold">Ingestion trend</h2>
            <Sparkline
              points={snapshot!.recent.map((c) => c.itemsFetched).reverse()}
            />
            <p className="text-xs text-muted">
              Items fetched per cycle, oldest → newest (trailing ~48 hourly
              cycles).
            </p>
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

/**
 * Inline-SVG sparkline (FID-2026-0905-003 stream C): items-per-cycle over
 * the trailing window. Pure — every input comes from the server-rendered
 * snapshot; no client JS, no dependencies. A flatline at 0 is an honest
 * rendering of zero ingestion, not an error.
 */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return null;
  }
  const W = 600;
  const H = 48;
  const PAD = 2;
  const max = Math.max(...points, 1);
  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - (p / max) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div className="rounded-2xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-12 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Items per cycle, ${points.length} cycles, peak ${max}`}
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p className="mt-1 flex justify-between text-[11px] text-muted">
        <span>oldest</span>
        <span>peak {max.toLocaleString("en")} items</span>
        <span>now {points[points.length - 1].toLocaleString("en")}</span>
      </p>
    </div>
  );
}
