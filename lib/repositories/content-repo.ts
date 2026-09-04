/**
 * Content repository (FID-002, migrated to Supabase per FID-2026-0904-010) —
 * the ONLY module that reads/writes the `content` table. Routes, services,
 * and components must go through these functions so query shapes stay pinned
 * to the SQL read-path functions in supabase/migrations.
 *
 * Signatures are identical to the Firestore implementation — pages, services,
 * and scripts compile unchanged. Cursor semantics changed internally: they
 * now encode (publishedAt, id) for keyset pagination instead of a bare
 * Firestore doc id (the DB row id is still the first cursor component, so
 * `/watch` doc-id lookups are unaffected).
 */

import "server-only";

import type { GithubRepoData } from "@/lib/fetchers/github-repos";
import { getServiceClient } from "@/lib/supabase/admin";
import {
  buildContentDocId,
  contentSchema,
  type ContentItem,
  type SourceType,
} from "@/lib/schemas/content";

const CONTENT_TABLE = "content";
/** Payload sanity cap per upsert call (PostgREST body limits are far higher). */
const MAX_BATCH_SIZE = 500;

/** Cursor format: `{id}::{publishedAtMs}` — ids never contain `::`. */
function encodeCursor(publishedAt: Date, id: string): string {
  return `${id}::${publishedAt.getTime()}`;
}

function decodeCursor(cursor: string): { id: string; publishedAt: string } {
  const sep = cursor.lastIndexOf("::");
  if (sep <= 0) {
    throw new Error(`Malformed content cursor: ${cursor}`);
  }
  return {
    id: cursor.slice(0, sep),
    publishedAt: new Date(Number(cursor.slice(sep + 2))).toISOString(),
  };
}

interface ContentRow {
  id: string;
  source_id: string;
  source_type: string;
  external_id: string;
  title: string;
  excerpt: string;
  content_html: string | null;
  url: string;
  thumbnail_url: string | null;
  source_name: string | null;
  github: GithubRepoData | null;
  author: string;
  published_at: string;
  tags: string[] | null;
  metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    rating?: number;
  } | null;
  featured: boolean;
  archived: boolean;
  created_at: string | null;
  updated_at: string;
}

function mapContentRow(row: ContentRow): ContentItem {
  return contentSchema.parse({
    ...row,
    id: row.id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    externalId: row.external_id,
    contentHtml: row.content_html ?? undefined,
    thumbnailUrl: row.thumbnail_url,
    sourceName: row.source_name,
    github: row.github,
    publishedAt: new Date(row.published_at),
    tags: row.tags ?? [],
    metrics: {
      views: row.metrics?.views ?? 0,
      likes: row.metrics?.likes ?? 0,
      comments: row.metrics?.comments ?? 0,
      rating: row.metrics?.rating ?? 0,
    },
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: new Date(row.updated_at),
  });
}

/** Real total count for a content slice (FID-015) — head-only, no rows. */
export async function countContent(options: {
  sourceType?: SourceType;
  /** Multi-type combined count (FID-2026-0904-009, the GitHub category). */
  sourceTypes?: SourceType[];
}): Promise<number> {
  let q = getServiceClient().from(CONTENT_TABLE).select("*", {
    count: "exact",
    head: true,
  });
  q = q.eq("archived", false);
  if (options.sourceType) {
    q = q.eq("source_type", options.sourceType);
  } else if (options.sourceTypes?.length) {
    q = q.in("source_type", options.sourceTypes);
  }
  const { count, error } = await q;
  if (error) {
    throw new Error(`countContent failed: ${error.message}`);
  }
  return count ?? 0;
}

export interface GetLatestContentOptions {
  sourceType?: SourceType;
  limit: number;
  /** Opaque cursor: kept for signature parity; callers use getLatestContentPage. */
  cursor?: string;
}

/** Newest-first content, optionally scoped to a source type. */
export async function getLatestContent({
  sourceType,
  limit,
}: GetLatestContentOptions): Promise<ContentItem[]> {
  let q = getServiceClient()
    .from(CONTENT_TABLE)
    .select("*")
    .eq("archived", false);
  if (sourceType) {
    q = q.eq("source_type", sourceType);
  }
  q = q.order("published_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) {
    throw new Error(`getLatestContent failed: ${error.message}`);
  }
  return (data ?? []).map((r) => mapContentRow(r as ContentRow));
}

/**
 * Diversified "latest" selection for home sections (FID-2026-0904-006).
 * One SQL call (content_capped) replaces the per-source N+1 loop; the
 * verified round-robin / top-up / freshness-sort orchestration is unchanged.
 */
export async function getLatestContentDiversified(options: {
  sourceType: SourceType;
  limit: number;
  perSourceCap?: number;
}): Promise<ContentItem[]> {
  const { sourceType, limit } = options;
  const perSourceCap = options.perSourceCap ?? 3;

  const { data, error } = await getServiceClient().rpc("content_capped", {
    p_types: [sourceType],
    p_cap: perSourceCap,
  });
  if (error) {
    throw new Error(`getLatestContentDiversified failed: ${error.message}`);
  }
  const perSourceLists = partitionBySource(
    (data ?? []).map((r: ContentRow) => mapContentRow(r)),
  );

  const selected = roundRobin(perSourceLists, limit, perSourceCap);

  // Top-up from the global chronological feed when sources are too few.
  if (selected.length < limit) {
    try {
      const filler = await getLatestContent({ sourceType, limit });
      const chosenIds = new Set(selected.map((i) => i.id));
      for (const item of filler) {
        if (selected.length >= limit) break;
        if (!chosenIds.has(item.id)) {
          selected.push(item);
          chosenIds.add(item.id);
        }
      }
    } catch (error) {
      console.error(
        "[content-repo] Diversified selector: filler query failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return selected.sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}

/**
 * Merged "latest" for a combined category (FID-2026-0904-009) — the GitHub
 * section/pages merge `opensource` + `trendshift` types.
 */
export async function getLatestContentMerged(options: {
  sourceTypes: SourceType[];
  limit: number;
  perSourceCap?: number;
}): Promise<ContentItem[]> {
  const { sourceTypes, limit } = options;
  const perSourceCap = options.perSourceCap ?? 3;

  const { data, error } = await getServiceClient().rpc("content_capped", {
    p_types: sourceTypes,
    p_cap: perSourceCap,
  });
  if (error) {
    throw new Error(`getLatestContentMerged failed: ${error.message}`);
  }
  const perSourceLists = partitionBySource(
    (data ?? []).map((r: ContentRow) => mapContentRow(r)),
  );

  const selected = roundRobin(perSourceLists, limit, perSourceCap);

  if (selected.length < limit) {
    try {
      const { data: filler } = await getServiceClient()
        .from(CONTENT_TABLE)
        .select("*")
        .eq("archived", false)
        .in("source_type", sourceTypes)
        .order("published_at", { ascending: false })
        .limit(limit);
      const chosenIds = new Set(selected.map((i) => i.id));
      for (const item of (filler ?? []).map((r) =>
        mapContentRow(r as ContentRow),
      )) {
        if (selected.length >= limit) break;
        if (!chosenIds.has(item.id)) {
          selected.push(item);
          chosenIds.add(item.id);
        }
      }
    } catch (error) {
      console.error(
        "[content-repo] Merged selector: filler query failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return selected.sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}

function partitionBySource(items: ContentItem[]): ContentItem[][] {
  const perSource = new Map<string, ContentItem[]>();
  for (const item of items) {
    const bucket = perSource.get(item.sourceId);
    if (bucket) {
      bucket.push(item);
    } else {
      perSource.set(item.sourceId, [item]);
    }
  }
  return Array.from(perSource.values());
}

/** Round-robin: pass k takes each source's k-th freshest item (capped). */
function roundRobin(
  perSourceLists: ContentItem[][],
  limit: number,
  perSourceCap: number,
): ContentItem[] {
  const selected: ContentItem[] = [];
  const chosen = new Set<string>();
  for (let pass = 0; pass < perSourceCap && selected.length < limit; pass++) {
    for (const list of perSourceLists) {
      if (selected.length >= limit) break;
      const item = list[pass];
      if (item && !chosen.has(item.id)) {
        selected.push(item);
        chosen.add(item.id);
      }
    }
  }
  return selected;
}

export interface GetTopContentOptions {
  limit: number;
}

/** Highest-viewed items of ONE source (FID-2026-0904-008) — SQL-ranked. */
export async function getTopByViewsForSource(options: {
  sourceId: string;
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_top_views", {
    p_source_id: options.sourceId,
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`getTopByViewsForSource failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/**
 * Highest-rated content across all source types. SQL-ranked (FID-003's
 * rating lives in metrics.rating; the Top Rated home section was removed by
 * FID-2026-0904-009 — retained for regression/script parity).
 */
export async function getTopContent({
  limit,
}: GetTopContentOptions): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_top_rated", {
    p_limit: limit,
  });
  if (error) {
    throw new Error(`getTopContent failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

export interface ContentPage {
  items: ContentItem[];
  /** Opaque cursor to the previous page's last item (null when none). */
  nextCursor: string | null;
  /** Opaque cursor to the next page's first item (null when none). */
  prevCursor: string | null;
}

/**
 * Newest-first cursor pagination (FID-015 + FID-009 merged types). Keyset
 * over (published_at desc, id desc) via the content_page SQL function.
 */
export async function getLatestContentPage(options: {
  sourceType?: SourceType;
  /** Multi-type combined page (FID-2026-0904-009, the GitHub category). */
  sourceTypes?: SourceType[];
  /** Single-source scope — deterministic pagination over one feed. */
  sourceId?: string;
  pageSize: number;
  cursor?: string;
  direction?: "next" | "prev";
}): Promise<ContentPage> {
  const {
    sourceType,
    sourceTypes,
    sourceId,
    pageSize,
    cursor,
    direction = "next",
  } = options;

  const types = sourceType ? [sourceType] : (sourceTypes ?? []);

  const args: Record<string, unknown> = {
    p_types: types.length > 0 ? types : null,
    p_page_size: pageSize,
    p_source_id: sourceId ?? null,
  };
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (direction === "prev") {
      args.p_after_published = decoded.publishedAt;
      args.p_after_id = decoded.id;
    } else {
      args.p_before_published = decoded.publishedAt;
      args.p_before_id = decoded.id;
    }
  }

  const { data, error } = await getServiceClient().rpc("content_page", args);
  if (error) {
    throw new Error(`getLatestContentPage failed: ${error.message}`);
  }
  const items = (data ?? []).map((r: ContentRow) => mapContentRow(r));

  if (items.length === 0) {
    return { items: [], nextCursor: null, prevCursor: null };
  }

  const first = items[0];
  const last = items[items.length - 1];

  return {
    items,
    // "Newer" exists if this page didn't start at the very top of the order.
    prevCursor:
      cursor && direction === "next"
        ? encodeCursor(first.publishedAt, first.id)
        : null,
    // "Older" exists if we filled a full page (there may be more).
    nextCursor:
      items.length === pageSize
        ? encodeCursor(last.publishedAt, last.id)
        : null,
  };
}

/** Latest items across ALL source types (FID-015, search input set). */
export async function getLatestContentAllTypes(options: {
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient()
    .from(CONTENT_TABLE)
    .select("*")
    .eq("archived", false)
    .order("published_at", { ascending: false })
    .limit(options.limit);
  if (error) {
    throw new Error(`getLatestContentAllTypes failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

export interface UpsertContentInput {
  sourceType: SourceType;
  externalId: string;
  sourceId: string;
  /** Denormalized source name for card badges (FID-2026-0904-007). */
  sourceName?: string | null;
  /** GitHub repo facts, written at fetch time (FID-2026-0904-009). */
  github?: GithubRepoData | null;
  title: string;
  excerpt: string;
  /** FID-020: full feed-provided body (sanitized), rss items only. */
  contentHtml?: string | null;
  url: string;
  thumbnailUrl: string | null;
  author: string;
  publishedAt: Date;
  tags: string[];
  metrics: {
    views: number;
    likes: number;
    comments: number;
    rating: number;
  };
  /**
   * Original creation time (data migration only). Upserts omit it — the
   * schema keeps `created_at` null on fetch-written rows (parity with the
   * Firestore merge semantics).
   */
  createdAt?: Date;
}

type UpsertRow = Record<string, unknown> & { id: string };

function buildUpsertRow(item: UpsertContentInput): UpsertRow {
  const docId = buildContentDocId(item.sourceType, item.externalId);
  // Validate against the domain schema before anything touches the DB —
  // invalid shapes never land (mirrors the Firestore-era invariant).
  contentSchema.parse({
    id: docId,
    sourceId: item.sourceId,
    sourceType: item.sourceType,
    externalId: item.externalId,
    title: item.title,
    excerpt: item.excerpt,
    contentHtml: item.contentHtml ?? undefined,
    sourceName: item.sourceName ?? null,
    github: item.github ?? null,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    author: item.author,
    publishedAt: item.publishedAt,
    tags: item.tags,
    metrics: item.metrics,
    featured: false,
    archived: false,
    createdAt: null,
    updatedAt: new Date(),
  });

  const row: UpsertRow = {
    id: docId,
    source_id: item.sourceId,
    source_type: item.sourceType,
    external_id: item.externalId,
    title: item.title,
    excerpt: item.excerpt,
    url: item.url,
    thumbnail_url: item.thumbnailUrl,
    source_name: item.sourceName ?? null,
    author: item.author,
    published_at: item.publishedAt.toISOString(),
    tags: item.tags,
    metrics: item.metrics,
    featured: false,
    archived: false,
    updated_at: new Date().toISOString(),
  };
  if (item.createdAt) {
    row.created_at = item.createdAt.toISOString();
  }
  // Absent keys are NOT written by Postgres ON CONFLICT DO UPDATE — omitted
  // columns keep their stored value. Bucketing (below) guarantees rows in one
  // call share the same key set so a missing value never clobbers an existing
  // enrichment (FID-020 semantics: absent contentHtml/github must not erase
  // previously backfilled values).
  return row;
}

/**
 * Idempotent batch upsert keyed by deterministic id.
 *
 * Rows are bucketed by shape ({content_html present, github present}) so each
 * upsert call carries a uniform column set — a row without github never
 * clobbers a stored github with NULL (Firestore's merge semantics preserved
 * exactly). Returns the number of rows written.
 */
export async function upsertContentBatch(
  items: UpsertContentInput[],
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const buckets = new Map<string, UpsertRow[]>();
  for (const item of items) {
    const row = buildUpsertRow(item);
    if (item.contentHtml) {
      row.content_html = item.contentHtml;
    }
    if (item.github) {
      row.github = item.github;
    }
    const key = `${item.contentHtml ? "h" : "-"}${item.github ? "g" : "-"}${
      item.createdAt ? "c" : "-"
    }`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }

  let written = 0;
  for (const rows of Array.from(buckets.values())) {
    for (let offset = 0; offset < rows.length; offset += MAX_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + MAX_BATCH_SIZE);
      const { error } = await getServiceClient()
        .from(CONTENT_TABLE)
        .upsert(chunk, { onConflict: "id" });
      if (error) {
        throw new Error(`upsertContentBatch failed: ${error.message}`);
      }
      written += chunk.length;
    }
  }
  return written;
}

/** Single-row fetch for detail views (article/watch) and cursor resolution. */
export async function getContentById(id: string): Promise<ContentItem | null> {
  const { data, error } = await getServiceClient()
    .from(CONTENT_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`getContentById failed: ${error.message}`);
  }
  return data ? mapContentRow(data as ContentRow) : null;
}

/**
 * Delete every content item produced by a source (FID-017 hard delete).
 * Single SQL statement; returns the number of rows removed.
 */
export async function deleteContentBySource(sourceId: string): Promise<number> {
  const { data, error } = await getServiceClient()
    .from(CONTENT_TABLE)
    .delete()
    .eq("source_id", sourceId)
    .select("id");
  if (error) {
    throw new Error(`deleteContentBySource failed: ${error.message}`);
  }
  return (data ?? []).length;
}
