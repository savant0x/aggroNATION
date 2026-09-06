"use client";

/**
 * Sources table (FID-009) — HeroUI slot-composed Table over the server page's
 * data. Mutations go through the admin API (PATCH/DELETE) passed in as
 * handlers by AdminDashboard; this component holds no fetch state itself.
 */

import { useState } from "react";
import { Switch, Table } from "@heroui/react";

import type { Source } from "@/lib/schemas/content";

export type EditingSource = Source;

interface SourceTableProps {
  sources: Source[];
  /** 1-based page number (FID-019: sources paginate at 15/page). */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onEdit: (source: Source) => void;
  onDelete: (source: Source) => void;
  onToggle: (source: Source, enabled: boolean) => void;
  onRestore: (source: Source) => void;
  onFetchNow: (source: Source) => void;
  busySourceId: string | null;
  /** FID-2026-0905-008: engine auto-disable threshold for the streak chip. */
  autoDisableThreshold: number;
}

function formatDate(value: Date | null): string {
  if (!value) return "never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function actionButtonClasses(extra: string): string {
  return `rounded-lg px-2 py-1 text-xs font-medium transition-colors ${extra}`;
}

/**
 * Health chip (FID-2026-0905-008 stream C): at-a-glance source health from
 * data the row already carries. Green enabled, grey archived, amber streak
 * building, red at/over the engine's auto-disable threshold.
 */
function HealthChip({
  enabled,
  streak,
  autoDisableThreshold,
}: {
  enabled: boolean;
  streak: number;
  autoDisableThreshold: number;
}) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
        {streak > 0 ? `off · ×${streak}` : "off"}
      </span>
    );
  }
  if (streak >= autoDisableThreshold) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-red-400"
        title={`Disabled at ${autoDisableThreshold} consecutive failures`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />×
        {streak} · cut off
      </span>
    );
  }
  if (streak > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-amber-400"
        title={`${streak} consecutive failure(s)`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />×
        {streak}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      ok
    </span>
  );
}

type SortKey = "name" | "type";
interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

/**
 * Clickable column header (FID-021) — toggles asc/desc on repeated clicks;
 * the arrow indicator shows the active direction. Owned client state instead
 * of react-aria's table-sort machinery: zero unverified API surface.
 */
function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label} ${active && sort.dir === "asc" ? "descending" : "ascending"}`}
      className="inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-[var(--color-accent-bright)]"
    >
      {label}
      <span aria-hidden="true" className={active ? "opacity-100" : "opacity-0"}>
        {active && sort.dir === "desc" ? "↓" : "↑"}
      </span>
    </button>
  );
}

export function SourceTable({
  sources,
  page,
  pageSize,
  onPageChange,
  onEdit,
  onDelete,
  onToggle,
  onRestore,
  onFetchNow,
  busySourceId,
  autoDisableThreshold,
}: SourceTableProps) {
  const [sort, setSort] = useState<SortState | null>(null);

  function handleSort(key: SortKey): void {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  // Sort the FULL list first — sorting only the visible page is a bug.
  const sorted = sort
    ? [...sources].sort((a, b) => {
        const cmp = a[sort.key].localeCompare(b[sort.key], "en", {
          sensitivity: "base",
        });
        return sort.dir === "asc" ? cmp : -cmp;
      })
    : sources;

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Clamp when deletions shrink the list (e.g. page 3 → 2 pages).
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const visible = sorted.slice(pageStart, pageStart + pageSize);

  if (sources.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-edge)] px-6 py-12 text-center text-sm text-muted">
        No sources registered yet. Add a YouTube channel to start the pipeline.
      </div>
    );
  }

  return (
    <Table aria-label="Content sources" className="w-full">
      <Table.Content>
        <Table.Header>
          <Table.Column isRowHeader>ID</Table.Column>
          <Table.Column>
            <SortableHeader
              label="Name"
              sortKey="name"
              sort={sort}
              onSort={handleSort}
            />
          </Table.Column>
          <Table.Column>
            <SortableHeader
              label="Type"
              sortKey="type"
              sort={sort}
              onSort={handleSort}
            />
          </Table.Column>
          <Table.Column>STATUS</Table.Column>
          <Table.Column>HEALTH</Table.Column>
          <Table.Column>INTERVAL</Table.Column>
          <Table.Column>FETCHED</Table.Column>
          <Table.Column>LAST FETCH</Table.Column>
          <Table.Column>ACTIONS</Table.Column>
        </Table.Header>
        <Table.Body>
          {visible.map((source) => {
            const busy = busySourceId === source.id;
            const hasError = source.metadata.lastError !== null;
            return (
              <Table.Row
                key={source.id}
                className={hasError ? "bg-red-500/5" : undefined}
              >
                <Table.Cell className="max-w-28 truncate font-mono text-xs text-muted">
                  {source.id}
                </Table.Cell>
                <Table.Cell>
                  <span
                    className="block max-w-52 truncate font-medium"
                    title={source.name}
                  >
                    {source.name}
                  </span>
                  <span
                    className="block max-w-52 truncate text-xs text-muted"
                    title={source.url}
                  >
                    {source.url}
                  </span>
                  {hasError && (
                    <span
                      className="mt-0.5 block max-w-52 truncate text-xs text-red-400"
                      title={source.metadata.lastError ?? undefined}
                    >
                      {source.metadata.lastError} (×
                      {source.metadata.consecutiveErrors})
                    </span>
                  )}
                </Table.Cell>
                <Table.Cell className="text-sm">{source.type}</Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col gap-1">
                    <Switch
                      size="sm"
                      isSelected={source.enabled && !source.archived}
                      isDisabled={busy || source.archived}
                      onChange={() => onToggle(source, !source.enabled)}
                      aria-label={`Enable ${source.name}`}
                    />
                    {source.archived && (
                      <span className="text-xs text-muted">archived</span>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <HealthChip
                    enabled={source.enabled && !source.archived}
                    streak={source.metadata.consecutiveErrors ?? 0}
                    autoDisableThreshold={autoDisableThreshold}
                  />
                </Table.Cell>
                <Table.Cell className="text-sm">
                  {source.config.fetchIntervalMinutes}m
                </Table.Cell>
                <Table.Cell className="text-sm">
                  {source.metadata.totalFetched}
                </Table.Cell>
                <Table.Cell className="text-xs text-muted">
                  {formatDate(source.metadata.lastFetchedAt)}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onFetchNow(source)}
                      className={actionButtonClasses(
                        "border border-[var(--color-edge)] hover:border-[var(--color-accent)]",
                      )}
                    >
                      {busy ? "Fetching…" : "Fetch now"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(source)}
                      className={actionButtonClasses(
                        "border border-[var(--color-edge)] hover:border-[var(--color-accent)]",
                      )}
                    >
                      Edit
                    </button>
                    {source.archived && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRestore(source)}
                        className={actionButtonClasses(
                          "border border-[var(--color-edge)] hover:border-[var(--color-accent)]",
                        )}
                      >
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(source)}
                      className={actionButtonClasses(
                        "border border-red-500/40 text-red-400 hover:border-red-400",
                      )}
                    >
                      Delete
                    </button>
                  </div>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Content>

      {pageCount > 1 && (
        <nav
          aria-label="Source pagination"
          className="mt-3 flex items-center justify-between gap-4"
        >
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-medium transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-muted">
            {pageStart + 1}–{pageStart + visible.length} of {sources.length}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
            className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-medium transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </nav>
      )}
    </Table>
  );
}
