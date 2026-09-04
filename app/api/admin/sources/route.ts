/**
 * Admin Sources API (FID-005) — list & create.
 * Gated by FID-004 requireAdmin: 401 unauthenticated, 403 non-admin.
 * Zod validates every write; duplicates return 409; failures return 422.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AuthError, requireAdmin } from "@/lib/auth/session";
import { sourceTypeSchema } from "@/lib/schemas/content";
import {
  createSource,
  getAllSources,
  getSourceByUrl,
} from "@/lib/repositories/source-repo";
import { runFetchForSource } from "@/lib/services/fetch-service";
import { purgeContentRoutes } from "@/lib/cache/revalidate";

export const dynamic = "force-dynamic";

/** Bounded auto-fetch on create (FID-016). */
export const maxDuration = 60;

const createSourceSchema = z.object({
  type: sourceTypeSchema,
  name: z.string().min(1).max(120),
  url: z.string().url(),
  enabled: z.boolean().optional(),
  config: z
    .object({
      fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
      tags: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

/** Map AuthError/other failures to the route error contract. */
function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error("[admin/sources] Unexpected failure:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET() {
  try {
    await requireAdmin();
    const sources = await getAllSources();
    return NextResponse.json({ sources, count: sources.length });
  } catch (error) {
    return errorResponse(error);
  }
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

    const parsed = createSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 422 },
      );
    }

    const duplicate = await getSourceByUrl(parsed.data.url);
    if (duplicate) {
      return NextResponse.json(
        { error: "A source with this URL already exists" },
        { status: 409 },
      );
    }

    const source = await createSource(parsed.data);

    // Auto-fetch the new source immediately (FID-016) — awaited so the feed is
    // filled before the operator sees it; failures are data, not thrown.
    const fetch = await runFetchForSource(source);

    // New content on the page — purge the ISR cache.
    purgeContentRoutes();

    return NextResponse.json(
      {
        source,
        fetch: {
          ran: true,
          itemsFetched: fetch.itemsFetched,
          error: fetch.error,
          warnings: fetch.warnings,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
