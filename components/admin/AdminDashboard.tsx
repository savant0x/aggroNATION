"use client";

/**
 * Admin dashboard client wrapper (FID-009). Owns the coordinated overlay
 * state for the create/edit modal and delete dialog so the server page stays
 * pure; `router.refresh()` re-serializes the server component after each
 * mutation, which re-reads the repository (single source of truth).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useOverlayState } from "@heroui/react";

import type { Source } from "@/lib/schemas/content";

/** Operator spec (FID-019): 15 rows per page, system-wide page size. */
const SOURCES_PAGE_SIZE = 15;

/** Engine auto-disable threshold (FID-2026-0905-005) — shown, not redefined. */
const AUTO_DISABLE_THRESHOLD = 5;
import {
  SourceTable,
  type EditingSource,
} from "@/components/admin/SourceTable";
import { SourceFormModal } from "@/components/admin/SourceFormModal";
import { BulkImportModal } from "@/components/admin/BulkImportModal";
import { DeleteSourceDialog } from "@/components/admin/DeleteSourceDialog";

interface AdminDashboardProps {
  initialSources: Source[];
  loadError: string | null;
}

interface FetchRunSummary {
  ok: boolean;
  total: number;
  succeeded: number;
  failed: number;
  items: number;
  error: string | null;
}

export function AdminDashboard({
  initialSources,
  loadError,
}: AdminDashboardProps) {
  const router = useRouter();
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fetchRun, setFetchRun] = useState<FetchRunSummary | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [sourcePage, setSourcePage] = useState(1);
  const [rowOutcome, setRowOutcome] = useState<{
    name: string;
    ok: boolean;
    message: string;
  } | null>(null);

  const formState = useOverlayState();
  const deleteState = useOverlayState();
  const importState = useOverlayState();
  const [editing, setEditing] = useState<EditingSource | null>(null);
  const [deleting, setDeleting] = useState<Source | null>(null);

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    formState.open();
  }

  function openEdit(source: Source): void {
    setEditing(source);
    setFormError(null);
    formState.open();
  }

  function openDelete(source: Source): void {
    setDeleting(source);
    deleteState.open();
  }

  async function handleToggle(source: Source, enabled: boolean): Promise<void> {
    setBusySourceId(source.id);
    setFormError(null);
    try {
      const response = await fetch(`/api/admin/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Update failed (${response.status})`);
      }
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusySourceId(null);
    }
  }

  async function handleRestore(source: Source): Promise<void> {
    setBusySourceId(source.id);
    setFormError(null);
    try {
      const response = await fetch(`/api/admin/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false, enabled: true }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Restore failed (${response.status})`);
      }
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setBusySourceId(null);
    }
  }

  async function handleFetchAllNow(): Promise<void> {
    setIsFetching(true);
    setFetchRun(null);
    try {
      const response = await fetch("/api/admin/fetch", { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        totalSources?: number;
        succeeded?: number;
        failed?: number;
        itemsFetched?: number;
        error?: string;
      } | null;

      if (!response.ok || !body?.ok) {
        setFetchRun({
          ok: false,
          total: 0,
          succeeded: 0,
          failed: 0,
          items: 0,
          error: body?.error ?? `Fetch failed (${response.status})`,
        });
        return;
      }

      setFetchRun({
        ok: true,
        total: body.totalSources ?? 0,
        succeeded: body.succeeded ?? 0,
        failed: body.failed ?? 0,
        items: body.itemsFetched ?? 0,
        error: null,
      });
      router.refresh();
    } catch (error) {
      setFetchRun({
        ok: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        items: 0,
        error: error instanceof Error ? error.message : "Fetch failed",
      });
    } finally {
      setIsFetching(false);
    }
  }

  async function handleFetchNow(source: Source): Promise<void> {
    setBusySourceId(source.id);
    setRowOutcome(null);
    try {
      const response = await fetch(`/api/admin/sources/${source.id}/fetch`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        itemsFetched?: number;
        error?: string | null;
      } | null;
      if (!response.ok || !body?.ok) {
        setRowOutcome({
          name: source.name,
          ok: false,
          message: body?.error ?? `Fetch failed (${response.status})`,
        });
        return;
      }
      setRowOutcome({
        name: source.name,
        ok: true,
        message: `Fetched ${body.itemsFetched ?? 0} item(s).`,
      });
      router.refresh();
    } catch (error) {
      setRowOutcome({
        name: source.name,
        ok: false,
        message: error instanceof Error ? error.message : "Fetch failed",
      });
    } finally {
      setBusySourceId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            onPress={openCreate}
            className="glow-accent rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] font-medium text-white"
          >
            + Add source
          </Button>
          <Button
            variant="tertiary"
            onPress={() => importState.open()}
            className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
          >
            Bulk import
          </Button>
          <Button
            variant="tertiary"
            onPress={handleFetchAllNow}
            isDisabled={isFetching}
            className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
          >
            {isFetching ? "Fetching…" : "Fetch all now"}
          </Button>
        </div>
        {fetchRun && (
          <p
            role="status"
            className={
              fetchRun.ok
                ? "text-sm text-[var(--color-accent-bright)]"
                : "text-sm text-red-400"
            }
          >
            {fetchRun.ok
              ? `Fetched ${fetchRun.items} item(s) — ${fetchRun.succeeded}/${fetchRun.total} source(s) ok${fetchRun.failed > 0 ? `, ${fetchRun.failed} failed` : ""}.`
              : `Fetch failed: ${fetchRun.error}`}
          </p>
        )}
      </div>

      {rowOutcome && (
        <p
          role="status"
          className={
            rowOutcome.ok
              ? "text-sm text-[var(--color-accent-bright)]"
              : "text-sm text-red-400"
          }
        >
          {rowOutcome.name}: {rowOutcome.message}
        </p>
      )}

      {formError && (
        <p role="alert" className="text-sm text-red-400">
          {formError}
        </p>
      )}

      {loadError && (
        <p role="alert" className="text-sm text-red-400">
          {loadError}
        </p>
      )}

      <SourceTable
        sources={initialSources}
        page={sourcePage}
        pageSize={SOURCES_PAGE_SIZE}
        onPageChange={setSourcePage}
        onEdit={openEdit}
        onDelete={openDelete}
        onToggle={handleToggle}
        onRestore={handleRestore}
        onFetchNow={handleFetchNow}
        busySourceId={busySourceId}
        autoDisableThreshold={AUTO_DISABLE_THRESHOLD}
      />

      <SourceFormModal
        state={formState}
        editing={editing}
        onClose={() => formState.close()}
      />
      <BulkImportModal
        state={importState}
        onClose={() => importState.close()}
      />
      <DeleteSourceDialog
        state={deleteState}
        source={deleting}
        onClose={() => {
          deleteState.close();
          setDeleting(null);
        }}
      />
    </div>
  );
}
