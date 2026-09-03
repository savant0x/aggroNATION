/**
 * Admin Sources API (FID-005) — update & soft-delete.
 *
 * PATCH: partial update (name/enabled/config).
 * DELETE: soft-delete ONLY — sets archived + enabled=false so historical
 * content linkage survives. Hard delete is deliberately not offered.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AuthError, requireAdmin } from "@/lib/auth/session";
import {
  getSourceById,
  updateSource,
  type SourcePatch,
} from "@/lib/repositories/source-repo";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
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

    return NextResponse.json({ source: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const existing = await getSourceById(id);
    if (!existing) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Soft delete: preserve content linkage.
    await updateSource(id, { enabled: false, archived: true });

    return NextResponse.json({ ok: true, id, deleted: "soft" });
  } catch (error) {
    return errorResponse(error);
  }
}
