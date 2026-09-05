import { NextResponse, type NextRequest } from "next/server";

import { SEARCH_LIMIT, searchContent } from "@/lib/repositories/content-repo";

/**
 * Search API (FID-2026-0904-022 stream C) — JSON wrapper over searchContent
 * for the command palette (the repo module is server-only, so the client
 * palette needs this route). Public read, bounded; errors are 500 JSON,
 * never thrown (Law 14).
 */

export const dynamic = "force-dynamic";

const PALETTE_LIMIT = Math.min(8, SEARCH_LIMIT);

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length === 0) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await searchContent({ query: q, limit: PALETTE_LIMIT });
    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        sourceType: item.sourceType,
        url:
          item.sourceType === "youtube"
            ? `/watch/${item.externalId}`
            : `/article/${item.id}`,
      })),
    });
  } catch (error) {
    console.error("[/api/search] query failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
