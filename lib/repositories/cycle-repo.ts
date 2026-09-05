/**
 * Fetch-cycle repository (FID-2026-0905-002 stream A) — the ONLY module that
 * reads/writes the `fetch_cycles` table. Append-only log of ingestion
 * cycles; nothing ever updates or deletes a row.
 *
 * The service layer calls recordFetchCycle with a call-site catch: an
 * observability failure must never break ingestion (documented trade-off —
 * a missed record shows honestly as "no cycle recorded yet" on /status).
 */

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import type {
  FetchAllResult,
  SourceFetchOutcome,
} from "@/lib/services/fetch-service";

const CYCLES_TABLE = "fetch_cycles";

interface CycleRow {
  id: number;
  ran_at: string;
  duration_ms: number;
  total_sources: number;
  succeeded: number;
  failed: number;
  items_fetched: number;
  outcomes: StoredOutcome[] | null;
  scrub_findings_count: number;
}

interface StoredOutcome {
  sourceId: string;
  sourceType: string;
  sourceName: string;
  ok: boolean;
  itemsFetched: number;
  error: string | null;
}

/** Per-source health derived from the trailing cycle window. */
export interface SourceStatus {
  sourceId: string;
  sourceType: string;
  sourceName: string;
  ok: boolean | null;
  itemsFetched: number;
  error: string | null;
  lastRanAt: Date | null;
}

export interface CycleStatus {
  ranAt: Date;
  durationMs: number;
  totalSources: number;
  succeeded: number;
  failed: number;
  itemsFetched: number;
  scrubFindingsCount: number;
}

export interface StatusSnapshot {
  lastCycle: CycleStatus | null;
  /** Trailing cycles, newest first (bounded window). */
  recent: CycleStatus[];
  sources: SourceStatus[];
}

function mapCycleRow(row: CycleRow): CycleStatus {
  return {
    ranAt: new Date(row.ran_at),
    durationMs: row.duration_ms,
    totalSources: row.total_sources,
    succeeded: row.succeeded,
    failed: row.failed,
    itemsFetched: row.items_fetched,
    scrubFindingsCount: row.scrub_findings_count,
  };
}

function toStoredOutcome(o: SourceFetchOutcome): StoredOutcome {
  return {
    sourceId: o.sourceId,
    sourceType: o.sourceType,
    sourceName: o.sourceName,
    ok: o.ok,
    itemsFetched: o.itemsFetched,
    error: o.error,
  };
}

/** Record one finished cycle. Fire-and-forget from the caller's perspective. */
export async function recordFetchCycle(result: FetchAllResult): Promise<void> {
  const { error } = await getServiceClient()
    .from(CYCLES_TABLE)
    .insert({
      ran_at: result.ranAt.toISOString(),
      duration_ms: result.durationMs,
      total_sources: result.totalSources,
      succeeded: result.succeeded,
      failed: result.failed,
      items_fetched: result.itemsFetched,
      outcomes: result.outcomes.map(toStoredOutcome),
      scrub_findings_count: result.scrubFindings.length,
    });
  if (error) {
    throw new Error(`recordFetchCycle failed: ${error.message}`);
  }
}

/**
 * The latest cycle only (FID-2026-0905-002 stream D) — the lightweight read
 * the purge webhook embeds in its response so the runner can annotate
 * source failures without a full snapshot query.
 */
export async function getLatestCycle(): Promise<CycleStatus | null> {
  const { data, error } = await getServiceClient()
    .from(CYCLES_TABLE)
    .select(
      "id, ran_at, duration_ms, total_sources, succeeded, failed, items_fetched, outcomes, scrub_findings_count",
    )
    .order("ran_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`getLatestCycle failed: ${error.message}`);
  }
  const row = ((data ?? []) as CycleRow[])[0];
  return row ? mapCycleRow(row) : null;
}

/**
 * The status snapshot: latest cycle, trailing window, and per-source health
 * derived from the most recent outcome per source across that window.
 */
export async function getStatusSnapshot(): Promise<StatusSnapshot> {
  const client = getServiceClient();

  const { data, error } = await client
    .from(CYCLES_TABLE)
    .select(
      "id, ran_at, duration_ms, total_sources, succeeded, failed, items_fetched, outcomes, scrub_findings_count",
    )
    .order("ran_at", { ascending: false })
    .limit(48);
  if (error) {
    throw new Error(`getStatusSnapshot failed: ${error.message}`);
  }

  const rows = (data ?? []) as CycleRow[];
  if (rows.length === 0) {
    return { lastCycle: null, recent: [], sources: [] };
  }

  const recent = rows.map(mapCycleRow);

  // Per-source health: the newest recorded outcome per source across the
  // window. Rows are newest-first, so first sight wins.
  const bySource = new Map<string, SourceStatus>();
  for (const row of rows) {
    for (const o of row.outcomes ?? []) {
      const key = o.sourceId || o.sourceName;
      if (!bySource.has(key)) {
        bySource.set(key, {
          sourceId: o.sourceId,
          sourceType: o.sourceType,
          sourceName: o.sourceName,
          ok: o.ok,
          itemsFetched: o.itemsFetched,
          error: o.error,
          lastRanAt: new Date(row.ran_at),
        });
      }
    }
  }

  return {
    lastCycle: recent[0] ?? null,
    recent,
    sources: Array.from(bySource.values()).sort((a, b) =>
      (a.sourceType + a.sourceName).localeCompare(b.sourceType + b.sourceName),
    ),
  };
}
