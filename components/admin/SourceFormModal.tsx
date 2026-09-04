"use client";

/**
 * Create/edit source form (FID-009) in a HeroUI modal. Client-side Zod
 * schema mirrors the route's `createSourceSchema` (FID-005) — validation
 * stays in sync because both reject before anything is written; the API
 * remains the authority (client check is UX, not security).
 *
 * The inner form is keyed by its target (source id or "new") so fields
 * initialize from props on remount — no reset effects needed.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Input,
  Label,
  Modal,
  TextField,
  type UseOverlayStateReturn,
} from "@heroui/react";
import { z } from "zod";

import type { Source, SourceType } from "@/lib/schemas/content";
import { SOURCE_TYPES } from "@/lib/schemas/content";

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  youtube: "YouTube",
  rss: "RSS",
  reddit: "Reddit",
  huggingface: "HuggingFace",
  trendshift: "Trendshift",
  opensource: "Open Source Projects",
};

/** Per-type URL hint — a wrong-type paste fails honestly at fetch (FID-017);
 *  the hint prevents the mistake in the first place. */
const SOURCE_TYPE_URL_HINTS: Partial<Record<SourceType, string>> = {
  reddit: "https://www.reddit.com/r/singularity",
  huggingface: "https://huggingface.co/papers",
  youtube: "https://www.youtube.com/@TwoMinutePapers",
  rss: "https://openai.com/news/rss.xml",
  trendshift: "https://trendshift.io/?sort=views",
  opensource: "https://www.opensourceprojects.dev/rss",
};

const formSchema = z.object({
  type: z.enum(SOURCE_TYPES),
  name: z.string().min(1).max(120),
  url: z.string().url(),
  fetchIntervalMinutes: z.coerce.number().int().min(5).max(1440),
  maxItems: z.coerce.number().int().min(1).max(200),
});

const EMPTY_DRAFT = {
  type: "youtube" as SourceType,
  name: "",
  url: "",
  interval: "60",
  maxItems: "50",
};

interface SourceFormModalProps {
  state: UseOverlayStateReturn;
  editing: Source | null;
  onClose: () => void;
}

export function SourceFormModal({
  state,
  editing,
  onClose,
}: SourceFormModalProps) {
  const formKey = editing?.id ?? "new";

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="max-w-lg">
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold">
                {editing ? "Edit source" : "Add source"}
              </Modal.Heading>
              <Modal.CloseTrigger aria-label="Close form" />
            </Modal.Header>
            <Modal.Body>
              <SourceForm
                key={formKey}
                editing={editing}
                initial={
                  editing
                    ? {
                        type: editing.type,
                        name: editing.name,
                        url: editing.url,
                        interval: String(editing.config.fetchIntervalMinutes),
                        maxItems: String(editing.config.maxItems),
                      }
                    : EMPTY_DRAFT
                }
                onClose={onClose}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

interface SourceFormProps {
  editing: Source | null;
  initial: typeof EMPTY_DRAFT;
  onClose: () => void;
}

function SourceForm({ editing, initial, onClose }: SourceFormProps) {
  const router = useRouter();
  const [type, setType] = useState<SourceType>(initial.type);
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  const [interval, setInterval] = useState(initial.interval);
  const [maxItems, setMaxItems] = useState(initial.maxItems);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = formSchema.safeParse({
      type,
      name,
      url,
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
      const isEdit = editing !== null;
      const response = await fetch(
        isEdit ? `/api/admin/sources/${editing.id}` : "/api/admin/sources",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: parsed.data.type,
            name: parsed.data.name,
            url: parsed.data.url,
            config: {
              fetchIntervalMinutes: parsed.data.fetchIntervalMinutes,
              maxItems: parsed.data.maxItems,
            },
          }),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          details?: Array<{ path: string[]; message: string }>;
        } | null;
        if (body?.details?.length) {
          setError(
            `${body.details[0].path.join(".")}: ${body.details[0].message}`,
          );
        } else {
          setError(body?.error ?? `Request failed (${response.status})`);
        }
        return;
      }

      // FID-017: creation and type/url edits fetch immediately; surface the
      // outcome so a failed repair is honest and retryable in place.
      const body = (await response.json().catch(() => null)) as {
        fetch?: { ran: boolean; itemsFetched: number; error: string | null };
        refetched?: boolean;
      } | null;

      router.refresh();

      if (body?.fetch?.error) {
        setError(`Saved — but the immediate fetch failed: ${body.fetch.error}`);
        return; // keep the modal open so the operator can correct and retry
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <Alert status="danger" role="alert">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <TextField name="type" isRequired>
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
      </TextField>

      <TextField name="name" isRequired>
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Two Minute Papers"
        />
      </TextField>

      <TextField name="url" isRequired>
        <Label>URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={SOURCE_TYPE_URL_HINTS[type]}
          inputMode="url"
        />
      </TextField>

      <div className="grid grid-cols-2 gap-3">
        <TextField name="interval">
          <Label>Interval (minutes)</Label>
          <Input
            type="number"
            min={5}
            max={1440}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </TextField>
        <TextField name="maxItems">
          <Label>Max items</Label>
          <Input
            type="number"
            min={1}
            max={200}
            value={maxItems}
            onChange={(e) => setMaxItems(e.target.value)}
          />
        </TextField>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          variant="tertiary"
          onPress={onClose}
          className="rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          isDisabled={isSubmitting}
          className="glow-accent rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] font-medium text-white"
        >
          {isSubmitting ? "Saving…" : editing ? "Save changes" : "Add source"}
        </Button>
      </div>
    </form>
  );
}
