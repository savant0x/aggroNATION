"use client";

/**
 * Delete confirmation (FID-009, escape hatch added by FID-017).
 *
 * Two paths, made explicit so the operator is never trapped:
 * - Soft archive (default for live sources): stops fetching, keeps the row
 *   and content history, reversible via Restore.
 * - Permanent delete: removes the source AND every content item it produced.
 *   Primary action for archived sources (which previously had no delete
 *   control at all — the literal "cannot delete it" loop); a deliberate
 *   secondary action for live sources.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, type UseOverlayStateReturn } from "@heroui/react";

import type { Source } from "@/lib/schemas/content";

interface DeleteSourceDialogProps {
  state: UseOverlayStateReturn;
  source: Source | null;
  onClose: () => void;
}

export function DeleteSourceDialog({
  state,
  source,
  onClose,
}: DeleteSourceDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<"soft" | "hard" | null>(null);

  const isArchived = source?.archived ?? false;

  async function handleDelete(kind: "soft" | "hard"): Promise<void> {
    if (!source) return;
    setError(null);
    setIsDeleting(kind);
    try {
      const url =
        kind === "hard"
          ? `/api/admin/sources/${source.id}?hard=true`
          : `/api/admin/sources/${source.id}`;
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Delete failed (${response.status})`);
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(null);
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="max-w-md">
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold">
                {isArchived ? "Delete source permanently" : "Archive source"}
              </Modal.Heading>
              <Modal.CloseTrigger aria-label="Close dialog" />
            </Modal.Header>
            <Modal.Body>
              {isArchived ? (
                <p className="text-sm text-muted">
                  Permanently delete{" "}
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {source?.name ?? ""}
                  </span>
                  ? This removes the source{" "}
                  <span className="text-red-400">
                    and every content item it produced
                  </span>
                  . This cannot be undone.
                </p>
              ) : (
                <p className="text-sm text-muted">
                  Archive{" "}
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {source?.name ?? ""}
                  </span>
                  ? It stops fetching immediately. This is a soft delete — the
                  source and its content history remain and can be restored.
                </p>
              )}
              {error && (
                <p role="alert" className="mt-2 text-sm text-red-400">
                  {error}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="tertiary"
                onPress={onClose}
                className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
              >
                Cancel
              </Button>
              {isArchived ? (
                <Button
                  onPress={() => handleDelete("hard")}
                  isDisabled={isDeleting !== null}
                  className="rounded-xl bg-red-500/90 font-medium text-white hover:bg-red-500"
                >
                  {isDeleting === "hard" ? "Deleting…" : "Delete permanently"}
                </Button>
              ) : (
                <>
                  <Button
                    onPress={() => handleDelete("hard")}
                    isDisabled={isDeleting !== null}
                    variant="tertiary"
                    className="rounded-xl border border-red-500/40 text-red-400 hover:border-red-400"
                  >
                    {isDeleting === "hard" ? "Deleting…" : "Delete permanently"}
                  </Button>
                  <Button
                    onPress={() => handleDelete("soft")}
                    isDisabled={isDeleting !== null}
                    className="rounded-xl bg-[var(--color-surface)] font-medium text-[var(--color-text-primary)]"
                  >
                    {isDeleting === "soft" ? "Archiving…" : "Archive source"}
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
