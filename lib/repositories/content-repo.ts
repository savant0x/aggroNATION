/**
 * Content repository (FID-002, migrated to Supabase per FID-2026-0904-010) —
 * the ONLY module that reads/writes the `content` table. Routes, services,
 * and components must go through these functions so query shapes stay pinned
 * to the SQL read-path functions in supabase/migrations.
 *
 * Listing pagination is offset-based (FID-2026-0904-012 item 6): page
 * numbers encode directly into path segments, so no cursor codec exists
 * here anymore. The DB row id remains the doc id, so /watch lookups are
 * unaffected.
 */

import "server-only";

import type { GithubRepoData } from "@/lib/fetchers/github-repos";
import { momentumPatches } from "@/lib/momentum";
import { getServiceClient } from "@/lib/supabase/admin";
import { htmlToPlainText } from "@/lib/quality/scrubber";
import { stripLoneSurrogates } from "@/lib/strings";
import {
  buildContentDocId,
  contentSchema,
  type ContentItem,
  type SourceType,
} from "@/lib/schemas/content";

const CONTENT_TABLE = "content";
/** Payload sanity cap per upsert call (PostgREST body limits are far higher). */
const MAX_BATCH_SIZE = 500;

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
 * Page-able diversification (FID-2026-0905-007): highlights listings with
 * real pagination. Returns one page of the per-source-capped pool plus its
 * exact size, so the UI can render "Page N of M" from data, not guesses.
 *
 * Auto-cap (perSourceCap omitted): max(3, ceil(240 / active_sources)) —
 * floods stay capped while few-source categories pool their full depth
 * (2 flat feeds -> cap 120 -> pool 136 -> 7 pages, probed live).
 */
export async function getDiversifiedContentPage(options: {
  sourceType?: SourceType;
  sourceTypes?: SourceType[];
  pageSize: number;
  page: number;
  perSourceCap?: number;
}): Promise<ContentPage & { total: number }> {
  const { sourceType, sourceTypes, pageSize, page } = options;
  const types = sourceType ? [sourceType] : (sourceTypes ?? []);
  if (types.length === 0) {
    return { items: [], total: 0 };
  }
  const capped = Math.max(1, Math.floor(page));
  const size = Math.max(1, Math.floor(pageSize));

  const client = getServiceClient();
  const [pageResult, countResult] = await Promise.all([
    client.rpc("content_capped_pages", {
      p_types: types,
      p_cap: options.perSourceCap ?? null,
      p_limit: size,
      p_page: capped,
    }),
    client.rpc("content_capped_pages_count", {
      p_types: types,
      p_cap: options.perSourceCap ?? null,
    }),
  ]);
  if (pageResult.error) {
    throw new Error(
      `getDiversifiedContentPage failed: ${pageResult.error.message}`,
    );
  }
  if (countResult.error) {
    throw new Error(
      `getDiversifiedContentPage (count) failed: ${countResult.error.message}`,
    );
  }
  return {
    items: (pageResult.data ?? []).map((r: ContentRow) => mapContentRow(r)),
    total: Number(countResult.data ?? 0),
  };
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
  /** Pool/segment size when known (FID-2026-0905-007); strict offsets omit it. */
  total?: number;
}

/**
 * Newest-first offset pagination (FID-2026-0904-012 item 6). Page numbers
 * replace the Firestore-era keyset cursor so listing URLs are path segments
 * (/{type}/page/N) — stable, shareable, ISR-cacheable. Offset-drift
 * trade-off (items shifting when inserted mid-browse) is negligible at
 * 20/page with hourly fetches; Supabase has no read quota.
 */
export async function getLatestContentPage(options: {
  sourceType?: SourceType;
  /** Multi-type combined page (FID-2026-0904-009, the GitHub category). */
  sourceTypes?: SourceType[];
  /** Single-source scope — deterministic pagination over one feed. */
  sourceId?: string;
  pageSize: number;
  /** 1-based page number. Values < 1 are floored to 1. */
  page: number;
}): Promise<ContentPage> {
  const { sourceType, sourceTypes, sourceId, pageSize, page } = options;

  const types = sourceType ? [sourceType] : (sourceTypes ?? []);

  const { data, error } = await getServiceClient().rpc("content_page_offset", {
    p_types: types.length > 0 ? types : null,
    p_page_size: pageSize,
    p_page: Math.max(1, Math.floor(page)),
    p_source_id: sourceId ?? null,
  });
  if (error) {
    throw new Error(`getLatestContentPage failed: ${error.message}`);
  }
  const items = (data ?? []).map((r: ContentRow) => mapContentRow(r));
  return { items };
}

/**
 * Momentum baseline refresh (FID-2026-0905-002 self-correct).
 *
 * Per-cycle deltas are decay-noise: the rating decays every cycle, so a
 * week's organic gain evaporates from prev_rating within one hour (observed
 * live: top movers went 2 → 0 across one cycle). Movement is therefore
 * measured against rolling day/week baselines CARRIED ON THE ROW and
 * refreshed only when older than their window — a staircase of snapshots
 * that approximates "rating N ago" and can never lose a gain to decay.
 *
 * Bounded work: at most MAX_BASELINE_REFRESHES rows patched per cycle; the
 * rest catch up on subsequent cycles (steady state ≈ rows/day, far below
 * the cap). The read-modify-write merges the full metrics blob; the race
 * window against a concurrent upsert is milliseconds and single-cycle
 * staleness is the worst case.
 */
const MAX_BASELINE_REFRESHES = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function refreshMomentumBaselines(): Promise<number> {
  const client = getServiceClient();
  const { data, error } = await client
    .from(CONTENT_TABLE)
    .select("id, metrics")
    .eq("archived", false)
    .gte("updated_at", new Date(Date.now() - 8 * DAY_MS).toISOString())
    .limit(2000);
  if (error) {
    throw new Error(`refreshMomentumBaselines (read) failed: ${error.message}`);
  }

  let patched = 0;
  for (const row of (data ?? []) as {
    id: string;
    metrics: Record<string, unknown> | null;
  }[]) {
    if (patched >= MAX_BASELINE_REFRESHES) {
      break;
    }
    // Decision logic lives in the pure, unit-tested lib/momentum.ts; the
    // repo only moves bytes (Law 13).
    const patch = momentumPatches(row.metrics, Date.now());
    if (Object.keys(patch).length === 0) {
      continue;
    }
    const { error: patchError } = await client
      .from(CONTENT_TABLE)
      .update({
        metrics: {
          ...(row.metrics ?? {}),
          ...patch,
        } as typeof row.metrics,
      })
      .eq("id", row.id);
    if (patchError) {
      throw new Error(
        `refreshMomentumBaselines (patch) failed: ${patchError.message}`,
      );
    }
    patched += 1;
  }
  return patched;
}

/**
 * When the index was last touched by ANY write path (FID-2026-0905-002
 * stream B) — powers the "Index updated X ago" stamp on listing pages.
 * Null only on an empty index.
 */
export async function getIndexUpdatedAt(): Promise<Date | null> {
  const { data, error } = await getServiceClient()
    .from(CONTENT_TABLE)
    .select("updated_at")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`getIndexUpdatedAt failed: ${error.message}`);
  }
  const row = (data ?? [])[0] as { updated_at: string } | undefined;
  return row ? new Date(row.updated_at) : null;
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

/** Search result ceiling — a query page, not an export; bounded is honest. */
export const SEARCH_LIMIT = 200;

/** Related items (FID-2026-0904-023 stream D): same type, tag-overlap first. */
export async function getRelatedContent(options: {
  contentId: string;
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_related", {
    p_content_id: options.contentId,
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`getRelatedContent failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/** Tag listing (stream G) + count for pagination. */
export async function getContentByTag(options: {
  tag: string;
  limit: number;
  offset: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_by_tag", {
    p_tag: options.tag,
    p_limit: options.limit,
    p_offset: options.offset,
  });
  if (error) {
    throw new Error(`getContentByTag failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

export async function countContentByTag(tag: string): Promise<number> {
  const { data, error } = await getServiceClient().rpc("content_count_by_tag", {
    p_tag: tag,
  });
  if (error) {
    throw new Error(`countContentByTag failed: ${error.message}`);
  }
  return Number(data ?? 0);
}

/** Top tags sitewide (sitemap + discovery surfaces). */
export async function getTopTags(options: {
  limit: number;
}): Promise<Array<{ tag: string; items: number }>> {
  const { data, error } = await getServiceClient().rpc("top_tags", {
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`getTopTags failed: ${error.message}`);
  }
  return (data ?? []).map((r: { tag: string; items: number | string }) => ({
    tag: r.tag as string,
    items: Number(r.items ?? 0),
  }));
}

/** Rising items (stream H) — rating grew since the previous fetch cycle. */
export async function getRisingContent(options: {
  lookbackHours: number;
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_rising", {
    p_lookback_hours: options.lookbackHours,
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`getRisingContent failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/**
 * Biggest absolute movers over a day window (FID-2026-0905-002 stream C) —
 * strict gainers only (decay cannot fake a move), ranked by raw delta.
 * Backs the Rising page's "biggest moves this week" section.
 */
export async function getTopMovers(options: {
  days: number;
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_top_movers", {
    p_days: options.days,
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`getTopMovers failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/** Every item mentioning one repo (stream J). */
export async function getContentRepoItems(options: {
  slug: string;
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_repo_items", {
    p_slug: options.slug,
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`getContentRepoItems failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/** Time machine (stream K): top items from one UTC day-window. */
export async function getTimeMachineContent(options: {
  dayStart: Date;
  dayEnd: Date;
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc("content_time_machine", {
    p_day_start: options.dayStart.toISOString(),
    p_day_end: options.dayEnd.toISOString(),
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`getTimeMachineContent failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/**
 * Time machine, "one week ago" flavor — the day-window is computed inside
 * Postgres (`now() - interval '7 days'`) so callers never read the clock
 * during render (the purity rule rejected the component-side version).
 */
export async function getTimeMachineWeek(options: {
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient().rpc(
    "content_time_machine_week",
    { p_limit: options.limit },
  );
  if (error) {
    throw new Error(`getTimeMachineWeek failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/**
 * Server-side search (FID-2026-0904-021) — replaces the Firestore-era
 * newest-100 in-page filter. Case-insensitive substring match across
 * title / excerpt / author / source_name / tags, newest first, bounded via
 * the pinned `content_search` SQL function (the or-list parser cannot
 * express the tags jsonb::text cast — probed live, see the migration).
 * The pattern is parameter-bound; the repository sanitizes the token so it
 * cannot inject list syntax, wildcards, or parens into the ilike.
 */
export async function searchContent(options: {
  query: string;
  limit: number;
}): Promise<ContentItem[]> {
  const sanitized = options.query.replace(/[%(),\\]/g, " ").trim();
  if (sanitized.length === 0) {
    return [];
  }
  const { data, error } = await getServiceClient().rpc("content_search", {
    p_query: `%${sanitized}%`,
    p_limit: options.limit,
  });
  if (error) {
    throw new Error(`searchContent failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r as ContentRow));
}

/**
 * The Briefing (FID-2026-0904-019): per-category top items for one UTC date,
 * ranked by the fetch-time rating snapshot. Derived on demand — no digest
 * table, no snapshot writes; the same date always yields the same items
 * (ratings are stored snapshots, not recomputed per view).
 */
export async function getTopItemsForDate(options: {
  sourceType: SourceType;
  /** Inclusive UTC day start. */
  dayStart: Date;
  /** Exclusive UTC day end. */
  dayEnd: Date;
  limit: number;
}): Promise<ContentItem[]> {
  const { data, error } = await getServiceClient()
    .from(CONTENT_TABLE)
    .select("*")
    .eq("source_type", options.sourceType)
    .eq("archived", false)
    .gte("published_at", options.dayStart.toISOString())
    .lt("published_at", options.dayEnd.toISOString())
    .order("metrics->>rating", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(options.limit);
  if (error) {
    throw new Error(`getTopItemsForDate failed: ${error.message}`);
  }
  return (data ?? []).map((r: ContentRow) => mapContentRow(r));
}

/**
 * The Briefing index (FID-2026-0904-019): UTC dates that actually have
 * content, newest first, derived from recent rows (honest — a day with no
 * content never appears).
 */
export async function getRecentContentDays(options: {
  lookbackDays: number;
}): Promise<string[]> {
  const since = new Date(
    Date.now() - options.lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await getServiceClient()
    .from(CONTENT_TABLE)
    .select("published_at")
    .eq("archived", false)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(5000);
  if (error) {
    throw new Error(`getRecentContentDays failed: ${error.message}`);
  }
  const days = new Set<string>();
  for (const row of data ?? []) {
    days.add((row.published_at as string).slice(0, 10));
  }
  return Array.from(days).sort((a, b) => (a < b ? 1 : -1));
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
    /** FID-2026-0904-023 stream H: rating at the previous fetch cycle —
     *  momentum measurement. Absent on first sight (seeded to rating). */
    prevRating?: number;
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
    // Lone-surrogate net (upsertContentBatch jsonb fix): externally sourced
    // strings can already contain unpaired surrogates; JSON.stringify would
    // emit them as \uD800-\uDFFF escapes and Postgres jsonb rejects the row.
    // Sanitize every string that lands in a jsonb column at the boundary.
    title: stripLoneSurrogates(item.title),
    excerpt: stripLoneSurrogates(item.excerpt),
    url: item.url,
    thumbnail_url: item.thumbnailUrl,
    source_name: item.sourceName ?? null,
    author: stripLoneSurrogates(item.author),
    published_at: item.publishedAt.toISOString(),
    tags: item.tags.map((tag) => stripLoneSurrogates(tag)),
    metrics: {
      ...item.metrics,
      // Stream H momentum: prev_rating MUST be the stored previous-cycle
      // value (resolved by the batch read in upsertContentBatch) — seeding
      // it to the new rating every write would zero every delta and Rising
      // would never populate. First sight → seed to current (delta 0).
      prev_rating: item.metrics.prevRating ?? item.metrics.rating,
    },
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

  // Stream H momentum: resolve each incoming row's STORED rating (one
  // bounded indexed read per upsert call — chunks of 500 like the writes)
  // so prev_rating carries the real previous-cycle value. Items not yet
  // stored have no previous — buildUpsertRow seeds them to current.
  const docIds = items.map((item) =>
    buildContentDocId(item.sourceType, item.externalId),
  );
  const previousRatings = new Map<string, number>();
  for (let offset = 0; offset < docIds.length; offset += MAX_BATCH_SIZE) {
    const chunk = docIds.slice(offset, offset + MAX_BATCH_SIZE);
    const { data, error } = await getServiceClient()
      .from(CONTENT_TABLE)
      .select("id, metrics->>rating")
      .in("id", chunk);
    if (error) {
      throw new Error(
        `upsertContentBatch (prev read) failed: ${error.message}`,
      );
    }
    for (const row of data ?? []) {
      const value = (row as { id: string; rating: string | null }).rating;
      if (value !== null) {
        previousRatings.set((row as { id: string }).id, Number(value));
      }
    }
  }

  const buckets = new Map<string, UpsertRow[]>();
  for (const item of items) {
    const docId = buildContentDocId(item.sourceType, item.externalId);
    const stored = previousRatings.get(docId);
    const resolved: UpsertContentInput = stored
      ? { ...item, metrics: { ...item.metrics, prevRating: stored } }
      : item;
    const row = buildUpsertRow(resolved);
    if (item.contentHtml) {
      row.content_html = item.contentHtml;
      // FID-2026-0904-022 stream A: plain-text twin feeds the stored
      // search_tsv generated column (full-text search over bodies, without
      // ever indexing sanitized-HTML markup tokens). Co-occurs with
      // content_html in every write, so the bucket key is unchanged.
      row.content_text = htmlToPlainText(item.contentHtml);
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

/** Single-row fetch for detail views (article/watch) and comment authz. */
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
