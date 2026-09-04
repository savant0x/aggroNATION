"use client";

/**
 * Bulk import modal (FID-016). Paste a batch of lines — `Title | URL` pairs
 * or bare URLs — pick a source type, and every line is parsed, persisted,
 * and immediately fetched by the server. Per-line outcomes are rendered
 * below the form so partial failures are visible without leaving the page.
 *
 * The inner form is keyed on modal open-state resets (same pattern as
 * SourceFormModal — no reset effects).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Label,
  Modal,
  type UseOverlayStateReturn,
} from "@heroui/react";
import { z } from "zod";

import { SOURCE_TYPES, type SourceType } from "@/lib/schemas/content";

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  youtube: "YouTube",
  rss: "RSS",
  reddit: "Reddit",
  huggingface: "HuggingFace",
  trendshift: "Trendshift",
  opensource: "Open Source Projects",
};

const formSchema = z.object({
  text: z.string().min(1, "Paste at least one link"),
  type: z.enum(SOURCE_TYPES),
  fetchIntervalMinutes: z.coerce.number().int().min(5).max(1440),
  maxItems: z.coerce.number().int().min(1).max(200),
});

interface BulkLineResult {
  line: number;
  ok: boolean;
  skipped?: boolean;
  sourceId?: string;
  name?: string;
  itemsFetched?: number;
  error?: string;
}

interface BulkSummary {
  created: number;
  skipped: number;
  failed: number;
  results: BulkLineResult[];
}

interface BulkImportModalProps {
  state: UseOverlayStateReturn;
  onClose: () => void;
}

export function BulkImportModal({ state, onClose }: BulkImportModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold">
                Bulk import sources
              </Modal.Heading>
              <Modal.CloseTrigger aria-label="Close bulk import" />
            </Modal.Header>
            <Modal.Body>
              <BulkImportForm onClose={onClose} />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function BulkImportForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [type, setType] = useState<SourceType>("youtube");
  const [interval, setInterval] = useState("60");
  const [maxItems, setMaxItems] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSummary(null);

    const parsed = formSchema.safeParse({
      text,
      type,
      fetchIntervalMinutes: interval,
      maxItems,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(`${first.path.join(".") || "Form"}: ${first.message}`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Each line is parsed, created, AND fetched server-side — a large
      // paste can take a while; keep the button honest about it.
      const response = await fetch("/api/admin/sources/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: parsed.data.text,
          defaults: {
            type: parsed.data.type,
            fetchIntervalMinutes: parsed.data.fetchIntervalMinutes,
            maxItems: parsed.data.maxItems,
          },
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | (BulkSummary & { error?: string })
        | null;

      if (!response.ok) {
        setError(body?.error ?? `Import failed (${response.status})`);
        return;
      }

      setSummary({
        created: body?.created ?? 0,
        skipped: body?.skipped ?? 0,
        failed: body?.failed ?? 0,
        results: body?.results ?? [],
      });
      // Persistence is server-side; refresh re-serializes the source table.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert status="danger" role="alert">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!summary && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label>Links — one per line</Label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={
                "Two Minute Papers | https://www.youtube.com/@TwoMinutePapers\nhttps://www.youtube.com/@veritasium\nVeritasium – https://www.youtube.com/user/1veritasium"
              }
              className="w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-accent)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Formats: <code>Title | URL</code>, <code>Title – URL</code>,{" "}
              <code>Title , URL</code>, or a bare URL (name derived from the
              link). Duplicates are skipped, not errors.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as SourceType)}
                className="h-10 w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-accent)]"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Interval (min)</Label>
              <input
                type="number"
                min={5}
                max={1440}
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-accent)]"
              />
            </div>
            <div>
              <Label>Max items</Label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxItems}
                onChange={(e) => setMaxItems(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-accent)]"
              />
            </div>
          </div>

          <Button
            type="submit"
            isDisabled={isSubmitting}
            className="glow-accent rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] font-medium text-white"
          >
            {isSubmitting
              ? "Importing & fetching…"
              : "Import — parse, save & fetch now"}
          </Button>
        </form>
      )}

      {summary && (
        <div className="flex flex-col gap-3">
          <p
            role="status"
            className="text-sm text-[var(--color-accent-bright)]"
          >
            {summary.created} created · {summary.skipped} skipped ·{" "}
            {summary.failed} failed
          </p>
          <ul className="max-h-64 overflow-y-auto rounded-xl border border-[var(--color-edge)] p-2 text-sm">
            {summary.results.map((r) => (
              <li
                key={r.line}
                className="flex items-baseline justify-between gap-2 py-1"
              >
                <span className="text-[var(--color-text-secondary)]">
                  L{r.line}
                  {r.name ? ` — ${r.name}` : ""}
                </span>
                <span
                  className={
                    r.ok && !r.skipped
                      ? "text-[var(--color-accent-bright)]"
                      : r.skipped
                        ? "text-[var(--color-text-muted)]"
                        : "text-red-400"
                  }
                >
                  {r.ok &&
                    !r.skipped &&
                    `${r.itemsFetched ?? 0} item(s) fetched`}
                  {r.skipped && "skipped (exists)"}
                  {!r.ok && (r.error ?? "failed")}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onPress={() => setSummary(null)}
              className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
            >
              Import more
            </Button>
            <Button
              onPress={onClose}
              className="glow-accent rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] font-medium text-white"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
