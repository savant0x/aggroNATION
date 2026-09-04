/**
 * Source repository (FID-002, migrated to Supabase per FID-2026-0904-010) —
 * the ONLY module that reads/writes the `sources` table. Signatures are
 * identical to the Firestore implementation.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { getServiceClient } from "@/lib/supabase/admin";
import {
  sourceSchema,
  type Source,
  type SourceType,
} from "@/lib/schemas/content";

const SOURCES_TABLE = "sources";

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface SourceRow {
  id: string;
  type: string;
  name: string;
  url: string;
  enabled: boolean;
  archived: boolean;
  config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  resolution_cache: {
    channelId: string;
    resolvedAt: string;
  } | null;
  created_at: string;
  updated_at: string;
}

function mapSourceRow(row: SourceRow): Source {
  const rawMetadata = (row.metadata ?? {}) as Record<string, unknown>;
  const rawConfig = (row.config ?? {}) as Record<string, unknown>;
  const rawResolution = row.resolution_cache as {
    channelId: string;
    resolvedAt: string;
  } | null;

  return sourceSchema.parse({
    id: row.id,
    type: row.type,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    archived: row.archived,
    config: rawConfig,
    metadata: {
      lastFetchedAt: rawMetadata.lastFetchedAt
        ? toDate(String(rawMetadata.lastFetchedAt))
        : null,
      lastError: (rawMetadata.lastError as string | null) ?? null,
      consecutiveErrors:
        (rawMetadata.consecutiveErrors as number | undefined) ?? 0,
      totalFetched: (rawMetadata.totalFetched as number | undefined) ?? 0,
    },
    resolutionCache: rawResolution
      ? {
          channelId: rawResolution.channelId,
          resolvedAt: new Date(rawResolution.resolvedAt),
        }
      : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

export async function getAllSources(): Promise<Source[]> {
  const { data, error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`getAllSources failed: ${error.message}`);
  }
  return (data ?? []).flatMap((row) => {
    try {
      return [mapSourceRow(row as SourceRow)];
    } catch (parseError) {
      // Tolerant reader (FID-2026-0904-004 follow-up): one legacy/invalid row
      // (e.g. a type retired from the schema) must never sink the whole
      // dashboard query — skip it loudly instead.
      console.error(
        `[source-repo] Skipping unparseable source row ${
          (row as SourceRow).id
        } (type ${(row as SourceRow).type}):`,
        parseError instanceof Error ? parseError.message : parseError,
      );
      return [];
    }
  });
}

export async function getEnabledSources(): Promise<Source[]> {
  const { data, error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .select("*")
    .eq("enabled", true);
  if (error) {
    throw new Error(`getEnabledSources failed: ${error.message}`);
  }
  return (data ?? []).flatMap((row) => {
    try {
      return [mapSourceRow(row as SourceRow)];
    } catch (parseError) {
      console.error(
        `[source-repo] Skipping unparseable enabled source row ${
          (row as SourceRow).id
        } (type ${(row as SourceRow).type}):`,
        parseError instanceof Error ? parseError.message : parseError,
      );
      return [];
    }
  });
}

export async function getSourceById(id: string): Promise<Source | null> {
  const { data, error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`getSourceById failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  try {
    return mapSourceRow(data as SourceRow);
  } catch (parseError) {
    console.error(
      `[source-repo] Source row ${id} failed schema validation:`,
      parseError instanceof Error ? parseError.message : parseError,
    );
    return null;
  }
}

export async function getSourceByUrl(url: string): Promise<Source | null> {
  const { data, error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .select("*")
    .eq("url", url)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`getSourceByUrl failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  try {
    return mapSourceRow(data as SourceRow);
  } catch (parseError) {
    console.error(
      `[source-repo] Source row (url ${url}) failed schema validation:`,
      parseError instanceof Error ? parseError.message : parseError,
    );
    return null;
  }
}

export interface CreateSourceInput {
  type: SourceType;
  name: string;
  url: string;
  enabled?: boolean;
  config?: {
    fetchIntervalMinutes?: number;
    priority?: "low" | "medium" | "high";
    maxItems?: number;
    tags?: string[];
  };
}

export async function createSource(input: CreateSourceInput): Promise<Source> {
  const now = new Date();

  // Trim at the boundary — leading/trailing whitespace in names or URLs
  // breaks sorting and URL matching alike (FID-021 whitespace fix).
  const candidate = {
    id: "pending",
    type: input.type,
    name: input.name.trim(),
    url: input.url.trim(),
    enabled: input.enabled ?? true,
    archived: false,
    config: input.config ?? {},
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  const parsed = sourceSchema.parse({
    ...candidate,
    config: {
      fetchIntervalMinutes: candidate.config.fetchIntervalMinutes,
      priority: candidate.config.priority,
      maxItems: candidate.config.maxItems,
      tags: candidate.config.tags,
    },
    metadata: {
      lastFetchedAt: null,
      lastError: null,
      consecutiveErrors: 0,
      totalFetched: 0,
    },
  });

  const id = randomUUID();
  const { data, error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .insert({
      id,
      type: parsed.type,
      name: parsed.name,
      url: parsed.url,
      enabled: parsed.enabled,
      archived: parsed.archived,
      config: {
        fetchIntervalMinutes: parsed.config.fetchIntervalMinutes,
        priority: parsed.config.priority,
        maxItems: parsed.config.maxItems,
        tags: parsed.config.tags,
      },
      metadata: {
        lastFetchedAt: null,
        lastError: null,
        consecutiveErrors: 0,
        totalFetched: 0,
      },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(`createSource failed: ${error.message}`);
  }
  return mapSourceRow(data as SourceRow);
}

export interface SourcePatch {
  name?: string;
  /** FID-017: editable after create — a wrong-type source must be repairable. */
  type?: Source["type"];
  url?: string;
  enabled?: boolean;
  archived?: boolean;
  config?: Partial<{
    fetchIntervalMinutes: number;
    priority: "low" | "medium" | "high";
    maxItems: number;
    tags: string[];
  }>;
}

export async function updateSource(
  id: string,
  patch: SourcePatch,
): Promise<void> {
  const normalized: SourcePatch = {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.url !== undefined ? { url: patch.url.trim() } : {}),
  };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (normalized.name !== undefined) update.name = normalized.name;
  if (normalized.type !== undefined) update.type = normalized.type;
  if (normalized.url !== undefined) update.url = normalized.url;
  if (normalized.enabled !== undefined) update.enabled = normalized.enabled;
  if (normalized.archived !== undefined) update.archived = normalized.archived;

  // Config merges in SQL (`config || patch`) — PostgREST would replace the
  // whole jsonb and drop sibling keys (Firestore set(merge) parity).
  const configPatch = normalized.config;
  if (configPatch !== undefined) {
    const { error: cfgError } = await getServiceClient().rpc(
      "source_update_config",
      {
        p_id: id,
        p_config: configPatch as unknown as Record<string, unknown>,
      },
    );
    if (cfgError) {
      throw new Error(`updateSource config failed: ${cfgError.message}`);
    }
    delete update.config;
  }

  if (Object.keys(update).length === 0) {
    return;
  }
  const { error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .update(update)
    .eq("id", id);
  if (error) {
    throw new Error(`updateSource failed: ${error.message}`);
  }
}

/** Hard delete (FID-017) — content is removed via deleteContentBySource(). */
export async function hardDeleteSource(id: string): Promise<void> {
  const { error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`hardDeleteSource failed: ${error.message}`);
  }
}

/**
 * Persist the cached channel resolution (FID-003) so steady-state YouTube
 * fetches cost zero resolution quota. Full jsonb replace — the cache is an
 * owned blob, not a merge target.
 */
export async function saveResolutionCache(
  sourceId: string,
  channelId: string,
): Promise<void> {
  const { error } = await getServiceClient()
    .from(SOURCES_TABLE)
    .update({
      resolution_cache: {
        channelId,
        resolvedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);
  if (error) {
    throw new Error(`saveResolutionCache failed: ${error.message}`);
  }
}

export interface SourceMetadataPatch {
  lastFetchedAt?: Date | null;
  lastError?: string | null;
  consecutiveErrors?: number;
  totalFetched?: number;
}

/**
 * Merge-patch source fetch metadata. `metadata || patch` in SQL merges at
 * the top level — only the patched keys change, the rest are preserved
 * (Firestore's nested set(merge) parity).
 */
export async function touchSourceMetadata(
  id: string,
  patch: SourceMetadataPatch,
): Promise<void> {
  const patchJson: Record<string, unknown> = {};
  if (patch.lastFetchedAt !== undefined) {
    patchJson.lastFetchedAt = patch.lastFetchedAt
      ? patch.lastFetchedAt.toISOString()
      : null;
  }
  if (patch.lastError !== undefined) patchJson.lastError = patch.lastError;
  if (patch.consecutiveErrors !== undefined) {
    patchJson.consecutiveErrors = patch.consecutiveErrors;
  }
  if (patch.totalFetched !== undefined)
    patchJson.totalFetched = patch.totalFetched;

  // Merges in SQL (`metadata || patch`) — sibling metadata keys preserved.
  const { error } = await getServiceClient().rpc("source_update_metadata", {
    p_id: id,
    p_metadata: patchJson,
  });
  if (error) {
    throw new Error(`touchSourceMetadata failed: ${error.message}`);
  }
}
