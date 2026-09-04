/**
 * Bulk Import API (FID-016) — paste a batch of links (optionally with titles)
 * and get parsed, persisted, immediately-fetched sources back.
 *
 * Line formats, tried in order:
 *   Title | URL      Title – URL (en/em dash)      Title , URL      bare URL
 *
 * Per-line isolation: one bad line never aborts the batch. Duplicates are
 * reported as `skipped` (idempotent re-pastes are a feature). Failures are
 * data in the response — the route returns 200 even with partial failures.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AuthError, requireAdmin } from "@/lib/auth/session";
import { extractChannelIdentifier } from "@/lib/fetchers/youtube";
import { sourceTypeSchema, type SourceType } from "@/lib/schemas/content";
import { createSource, getSourceByUrl } from "@/lib/repositories/source-repo";
import { type Source } from "@/lib/schemas/content";
import { runFetchForSource } from "@/lib/services/fetch-service";
import { purgeContentRoutes } from "@/lib/cache/revalidate";

export const dynamic = "force-dynamic";

/** Per-line fetch can be slow; the whole batch is bounded (FID-016). */
export const maxDuration = 300;

const bulkSchema = z.object({
  text: z.string().min(1).max(100_000),
  defaults: z
    .object({
      type: sourceTypeSchema.optional(),
      fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
    })
    .optional(),
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

/** Split a raw line into an optional title and the URL token. */
function parseLine(raw: string): { title: string | null; url: string } | null {
  const line = raw.trim();
  if (line.length === 0) {
    return null;
  }

  // Separators in precedence order: | — – , (with flexible spacing).
  const separators = [/\s+\|\s+/, /\s+[—–]\s+/, /\s+,\s+/];
  for (const sep of separators) {
    const idx = line.search(sep);
    if (idx > 0) {
      const title = line.slice(0, idx).trim();
      const url = line.slice(idx).replace(sep, "").trim();
      if (title && url) {
        return { title, url };
      }
    }
  }

  // Bare URL (possibly "URL Title" reversed order — take the token that
  // looks like a URL).
  const tokens = line.split(/\s+/);
  const urlToken = tokens.find((t) => /^https?:\/\//i.test(t));
  if (urlToken) {
    return { title: null, url: urlToken };
  }

  return { title: null, url: line };
}

/** Derive a human name when the pasted line had no title. */
function fallbackName(type: SourceType, url: string): string {
  if (type === "youtube") {
    const id = extractChannelIdentifier(url);
    if (id) {
      return id.kind === "channelId"
        ? `Channel ${id.value.slice(0, 12)}`
        : id.value;
    }
  }
  return "Untitled";
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 422 },
      );
    }

    const defaults = parsed.data.defaults ?? {};
    const type: SourceType = defaults.type ?? "youtube";
    const lines = parsed.data.text.split(/\r?\n/);

    const results: BulkLineResult[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (raw.trim().length === 0) {
        continue;
      }
      const lineNumber = i + 1;

      try {
        const parsedLine = parseLine(raw);
        if (!parsedLine || !parsedLine.url) {
          failed++;
          results.push({
            line: lineNumber,
            ok: false,
            error: "Could not parse a URL from this line",
          });
          continue;
        }

        const urlCheck = z.string().url().safeParse(parsedLine.url);
        if (!urlCheck.success) {
          failed++;
          results.push({
            line: lineNumber,
            ok: false,
            error: `Not a valid URL: ${parsedLine.url.slice(0, 80)}`,
          });
          continue;
        }
        const url = urlCheck.data;

        const title = parsedLine.title ?? fallbackName(type, url);

        // Duplicate URLs are skipped, not errors (idempotent re-paste).
        const duplicate = await getSourceByUrl(url);
        if (duplicate) {
          skipped++;
          results.push({
            line: lineNumber,
            ok: true,
            skipped: true,
            sourceId: duplicate.id,
            name: duplicate.name,
            error: "Already exists — skipped",
          });
          continue;
        }

        const source: Source = await createSource({
          type,
          name: title.slice(0, 120),
          url,
          enabled: true,
          config: {
            fetchIntervalMinutes: defaults.fetchIntervalMinutes,
            maxItems: defaults.maxItems,
          },
        });

        // Auto-fetch the freshly created source immediately (FID-016).
        const fetch = await runFetchForSource(source);

        created++;
        results.push({
          line: lineNumber,
          ok: true,
          sourceId: source.id,
          name: source.name,
          itemsFetched: fetch.itemsFetched,
          error: fetch.error ?? undefined,
        });
      } catch (error) {
        failed++;
        results.push({
          line: lineNumber,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (created > 0) {
      // New content landed — purge the ISR cache.
      purgeContentRoutes();
    }

    return NextResponse.json({ created, skipped, failed, results });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[admin/sources/bulk] Unexpected failure:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
