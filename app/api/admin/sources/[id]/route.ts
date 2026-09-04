/**
 * Admin Sources API (FID-005) — update, soft-delete, hard-delete.
 *
 * PATCH: partial update (name/type/url/enabled/config). Type and url are
 * editable (FID-017) — a wrong-type source must be repairable; when either
 * changes the route re-fetches the source immediately and returns the
 * outcome as data.
 * DELETE: soft-delete by default (archived + enabled=false). With ?hard=true
 * (FID-017) the source AND all content it produced are permanently removed.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AuthError, requireAdmin } from "@/lib/auth/session";
import { sourceTypeSchema } from "@/lib/schemas/content";
import {
  getSourceById,
  hardDeleteSource,
  updateSource,
  type SourcePatch,
} from "@/lib/repositories/source-repo";
import { deleteContentBySource } from "@/lib/repositories/content-repo";
import { runFetchForSource } from "@/lib/services/fetch-service";
import { purgeContentRoutes } from "@/lib/cache/revalidate";

export const dynamic = "force-dynamic";

/** Type/url edits trigger an immediate re-fetch (FID-017). */
export const maxDuration = 60;

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: sourceTypeSchema.optional(),
  url: z.string().url().optional(),
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

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error(`[admin/sources/:id] Unexpected failure:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 422 },
      );
    }

    const existing = await getSourceById(id);
    if (!existing) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    await updateSource(id, parsed.data as SourcePatch);
    const updated = await getSourceById(id);
    if (!updated) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // FID-017: when the type or URL changed, prove the repair immediately —
    // re-fetch with the UPDATED source and return the outcome as data.
    const identityChanged =
      (parsed.data.type !== undefined && parsed.data.type !== existing.type) ||
      (parsed.data.url !== undefined && parsed.data.url !== existing.url);

    // Any content mutation (type/url refetch, name/config change, archive,
    // delete) can change what the pages render — purge the ISR cache.
    purgeContentRoutes();

    if (identityChanged) {
      const fetch = await runFetchForSource(updated);
      return NextResponse.json({
        source: updated,
        refetched: true,
        fetch: {
          ran: true,
          itemsFetched: fetch.itemsFetched,
          error: fetch.error,
          warnings: fetch.warnings,
        },
      });
    }

    return NextResponse.json({ source: updated, refetched: false });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const existing = await getSourceById(id);
    if (!existing) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // FID-017: ?hard=true permanently removes the source AND every content
    // item it produced. Escape hatch for garbage sources (e.g. a feed added
    // under the wrong type); soft archive remains the default.
    const hard = request.nextUrl.searchParams.get("hard") === "true";
    if (hard) {
      const contentDeleted = await deleteContentBySource(id);
      await hardDeleteSource(id);
      purgeContentRoutes();
      return NextResponse.json({
        ok: true,
        id,
        deleted: "hard",
        contentDeleted,
      });
    }

    // Soft delete: preserve content linkage.
    await updateSource(id, { enabled: false, archived: true });
    purgeContentRoutes();

    return NextResponse.json({ ok: true, id, deleted: "soft" });
  } catch (error) {
    return errorResponse(error);
  }
}
