/**
 * Source repository (FID-002) — the ONLY module that reads/writes the
 * `sources` collection.
 */

import "server-only";

import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import {
  sourceSchema,
  type Source,
  type SourceType,
} from "@/lib/schemas/content";

const SOURCES_COLLECTION = "sources";

function timestampToDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate() as Date;
  }
  throw new Error(
    `Unexpected timestamp shape in Firestore document: ${typeof value}`,
  );
}

function parseSourceDoc(snap: DocumentSnapshot<DocumentData>): Source {
  const data = snap.data();
  if (!data) {
    throw new Error(`Source document ${snap.id} has no data`);
  }

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const metadataTimestamps = data.metadata
    ? {
        metadata: {
          ...metadata,
          lastFetchedAt: metadata.lastFetchedAt
            ? timestampToDate(metadata.lastFetchedAt)
            : null,
        },
      }
    : {};

  const resolution = data.resolutionCache
    ? {
        resolutionCache: {
          channelId: (data.resolutionCache as { channelId: string }).channelId,
          resolvedAt: timestampToDate(
            (data.resolutionCache as { resolvedAt: unknown }).resolvedAt,
          ),
        },
      }
    : {};

  return sourceSchema.parse({
    ...data,
    ...metadataTimestamps,
    ...resolution,
    id: snap.id,
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
  });
}

export async function getAllSources(): Promise<Source[]> {
  const snapshot = await adminDb.collection(SOURCES_COLLECTION).get();
  return snapshot.docs.map(parseSourceDoc);
}

export async function getEnabledSources(): Promise<Source[]> {
  const snapshot = await adminDb
    .collection(SOURCES_COLLECTION)
    .where("enabled", "==", true)
    .get();
  return snapshot.docs.map(parseSourceDoc);
}

export async function getSourceById(id: string): Promise<Source | null> {
  const snap = await adminDb.collection(SOURCES_COLLECTION).doc(id).get();
  if (!snap.exists) {
    return null;
  }
  return parseSourceDoc(snap);
}

export async function getSourceByUrl(url: string): Promise<Source | null> {
  const snapshot = await adminDb
    .collection(SOURCES_COLLECTION)
    .where("url", "==", url)
    .limit(1)
    .get();

  const first = snapshot.docs[0];
  return first ? parseSourceDoc(first) : null;
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

  // Schema defaults fill unspecified config/metadata fields; validation
  // happens here so invalid shapes never reach Firestore.
  const candidate = {
    type: input.type,
    name: input.name,
    url: input.url,
    enabled: input.enabled ?? true,
    archived: false,
    config: input.config ?? {},
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  const parsed = sourceSchema.parse({
    id: "pending",
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

  const ref = adminDb.collection(SOURCES_COLLECTION).doc();
  const docData = {
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
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(docData);

  return sourceSchema.parse({ ...docData, id: ref.id });
}

export interface SourcePatch {
  name?: string;
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
  await adminDb
    .collection(SOURCES_COLLECTION)
    .doc(id)
    .set({ ...patch, updatedAt: new Date() }, { merge: true });
}

export interface SourceMetadataPatch {
  lastFetchedAt?: Date | null;
  lastError?: string | null;
  consecutiveErrors?: number;
  totalFetched?: number;
}

/**
 * Merge-patch source fetch metadata. Numeric fields use explicit values —
 * the caller (fetch service) is responsible for read-modify-write of
 * counters to keep this function side-effect-simple.
 */
export async function touchSourceMetadata(
  id: string,
  patch: SourceMetadataPatch,
): Promise<void> {
  await adminDb
    .collection(SOURCES_COLLECTION)
    .doc(id)
    .set({ metadata: patch, updatedAt: new Date() }, { merge: true });
}
