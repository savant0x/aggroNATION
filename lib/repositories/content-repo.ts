/**
 * Content repository (FID-002) — the ONLY module that reads/writes the
 * `content` collection. Routes, services, and components must go through
 * these functions so query shapes stay pinned to declared composite indexes.
 *
 * Index contract (firestore.indexes.json):
 * - Index 1: (sourceType ASC, archived ASC, publishedAt DESC) → getLatestContent
 * - Index 2: (archived ASC, metrics.rating DESC)              → getTopContent
 */

import "server-only";

import type {
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import {
  buildContentDocId,
  contentSchema,
  type ContentItem,
  type SourceType,
} from "@/lib/schemas/content";

const CONTENT_COLLECTION = "content";
/** Firestore hard limit per writeBatch. */
const MAX_BATCH_SIZE = 500;

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

function parseContentDoc(
  snap: QueryDocumentSnapshot<DocumentData>,
): ContentItem {
  const data = snap.data();
  return contentSchema.parse({
    ...data,
    id: snap.id,
    publishedAt: timestampToDate(data.publishedAt),
    // Upserted docs omit createdAt (merge semantics) — schema defaults to null.
    createdAt: data.createdAt ? timestampToDate(data.createdAt) : null,
    updatedAt: timestampToDate(data.updatedAt),
  });
}

export interface GetLatestContentOptions {
  sourceType?: SourceType;
  limit: number;
  /** Opaque cursor: content document id of the previous page's last item. */
  cursor?: string;
}

/**
 * Newest-first content, optionally scoped to a source type.
 * Matches composite index 1 exactly.
 */
export async function getLatestContent({
  sourceType,
  limit,
  cursor,
}: GetLatestContentOptions): Promise<ContentItem[]> {
  let q = adminDb.collection(CONTENT_COLLECTION).where("archived", "==", false);

  if (sourceType) {
    q = q.where("sourceType", "==", sourceType);
  }

  q = q.orderBy("publishedAt", "desc");

  if (cursor) {
    const cursorSnap = await adminDb
      .collection(CONTENT_COLLECTION)
      .doc(cursor)
      .get();
    if (!cursorSnap.exists) {
      throw new Error(`Cursor document not found: ${cursor}`);
    }
    q = q.startAfter(cursorSnap);
  }

  const snapshot = await q.limit(limit).get();
  return snapshot.docs.map(parseContentDoc);
}

export interface GetTopContentOptions {
  limit: number;
}

/**
 * Highest-rated content across all source types.
 * Matches composite index 2 exactly (global — no sourceType filter).
 */
export async function getTopContent({
  limit,
}: GetTopContentOptions): Promise<ContentItem[]> {
  const snapshot = await adminDb
    .collection(CONTENT_COLLECTION)
    .where("archived", "==", false)
    .orderBy("metrics.rating", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map(parseContentDoc);
}

export interface UpsertContentInput {
  sourceType: SourceType;
  externalId: string;
  sourceId: string;
  title: string;
  excerpt: string;
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
}

/**
 * Idempotent batch upsert keyed by deterministic document id.
 *
 * `archived`/`featured` are written explicitly (false) so every doc matches
 * the composite indexes — Firestore equality filters do NOT match docs where
 * the field is absent. Consequence (documented): refetches reset operator
 * flags; flag preservation is owned by the deferred admin dashboard flow.
 * Chunks at the 500-doc Firestore batch limit.
 *
 * Returns the number of documents written.
 */
export async function upsertContentBatch(
  items: UpsertContentInput[],
): Promise<number> {
  let written = 0;

  for (let offset = 0; offset < items.length; offset += MAX_BATCH_SIZE) {
    const chunk = items.slice(offset, offset + MAX_BATCH_SIZE);
    const batch = adminDb.batch();
    const now = new Date();

    for (const item of chunk) {
      const docId = buildContentDocId(item.sourceType, item.externalId);
      const ref = adminDb.collection(CONTENT_COLLECTION).doc(docId);

      // Validate against the domain schema before anything touches Firestore.
      contentSchema.parse({
        id: docId,
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        externalId: item.externalId,
        title: item.title,
        excerpt: item.excerpt,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        author: item.author,
        publishedAt: item.publishedAt,
        tags: item.tags,
        metrics: item.metrics,
        featured: false,
        archived: false,
        createdAt: null, // written shape omits createdAt (merge); null validates
        updatedAt: now,
      });

      batch.set(
        ref,
        {
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          externalId: item.externalId,
          title: item.title,
          excerpt: item.excerpt,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          author: item.author,
          publishedAt: item.publishedAt,
          tags: item.tags,
          metrics: item.metrics,
          // Explicit (not omitted): absent fields never match equality
          // queries, which would break both composite index contracts.
          featured: false,
          archived: false,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    await batch.commit();
    written += chunk.length;
  }

  return written;
}

/** Single-document fetch for cursor resolution and detail views. */
export async function getContentById(id: string): Promise<ContentItem | null> {
  const snap = await adminDb.collection(CONTENT_COLLECTION).doc(id).get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data() as DocumentData;
  return contentSchema.parse({
    ...data,
    id: snap.id,
    publishedAt: timestampToDate(data.publishedAt),
    createdAt: data.createdAt ? timestampToDate(data.createdAt) : null,
    updatedAt: timestampToDate(data.updatedAt),
  });
}
