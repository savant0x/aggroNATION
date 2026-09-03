/**
 * FID-002 dynamic verification against REAL Firestore (per FID verification
 * plan): seed → repo queries → dedupe idempotency → cleanup.
 *
 * Safe: uses a throwaway source doc and deletes everything it creates.
 */

import { getFirestore } from "firebase-admin/firestore";

import {
  getLatestContent,
  getTopContent,
  upsertContentBatch,
  getContentById,
  type UpsertContentInput,
} from "../lib/repositories/content-repo";
import {
  createSource,
  getEnabledSources,
  getSourceByUrl,
  updateSource,
  touchSourceMetadata,
  getSourceById,
} from "../lib/repositories/source-repo";
import { buildContentDocId } from "../lib/schemas/content";

async function main(): Promise<void> {
  const results: string[] = [];
  const check = (name: string, ok: boolean, detail = "") =>
    results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);

  // ---- Cleanup orphans from earlier crashed runs -----------------------
  const { adminDb } = await import("../lib/firebase/admin");
  const orphaned = await adminDb
    .collection("sources")
    .where("url", "==", "https://youtube.com/@fid002-verify-test")
    .get();
  for (const doc of orphaned.docs) {
    await doc.ref.delete();
  }

  // ---- Seed a source --------------------------------------------------
  const testUrl = "https://youtube.com/@fid002-verify-test";
  const source = await createSource({
    type: "youtube",
    name: "FID-002 verification source",
    url: testUrl,
  });
  check("createSource", source.id.length > 0 && source.config.maxItems === 50);

  const dupByedListing = await getEnabledSources();
  check("getEnabledSources finds seeded source", dupByedListing.some((s) => s.id === source.id));

  const byUrl = await getSourceByUrl(testUrl);
  check("getSourceByUrl", byUrl?.id === source.id);

  // ---- Seed content (5 items) ----------------------------------------
  const now = Date.now();
  const items: UpsertContentInput[] = Array.from({ length: 5 }, (_, i) => ({
    sourceType: "youtube" as const,
    externalId: `vid${i}`,
    sourceId: source.id,
    title: `Verification video ${i}`,
    excerpt: "excerpt",
    url: `https://www.youtube.com/watch?v=vid${i}`,
    thumbnailUrl: null,
    author: "Verifier",
    publishedAt: new Date(now - i * 60_000),
    tags: ["test"],
    metrics: { views: 1000 * (i + 1), likes: 50, comments: 5, rating: 0.1 * i },
  }));

  const firstWrite = await upsertContentBatch(items);
  check("upsertContentBatch (first)", firstWrite === 5, `${firstWrite} written`);

  // ---- Idempotency: same ids again -----------------------------------
  await upsertContentBatch(items);
  const latest = await getLatestContent({ sourceType: "youtube", limit: 50 });
  const ours = latest.filter((c) => c.sourceId === source.id);
  check("dedupe: still 5 docs after re-upsert", ours.length === 5, `${ours.length} found`);

  // ---- Query contracts ------------------------------------------------
  const ordered = await getLatestContent({ sourceType: "youtube", limit: 3 });
  const sortedDesc = ordered.every(
    (c, i) => i === 0 || ordered[i - 1].publishedAt >= c.publishedAt,
  );
  check("getLatestContent ordered desc + limit", ordered.length === 3 && sortedDesc);

  const top = await getTopContent({ limit: 5 });
  const topSorted = top.every((c, i) => i === 0 || top[i - 1].metrics.rating >= c.metrics.rating);
  check("getTopContent ordered by rating desc", top.length > 0 && topSorted);

  const byId = await getContentById(buildContentDocId("youtube", "vid2"));
  check("getContentById", byId?.title === "Verification video 2");

  // ---- Refetch resets operator flags (documented upsert contract) -------
  const docId = buildContentDocId("youtube", "vid0");
  await adminDb.collection("content").doc(docId).set({ featured: true }, { merge: true });
  const flagged = await getContentById(docId);
  check("manual flag set via direct write", flagged?.featured === true);
  await upsertContentBatch([items[0]]);
  const refetched = await getContentById(docId);
  check("refetch resets featured (documented contract)", refetched?.featured === false);

  // ---- Source metadata touch ------------------------------------------
  await touchSourceMetadata(source.id, {
    lastFetchedAt: new Date(),
    consecutiveErrors: 2,
  });
  const touched = await getSourceById(source.id);
  check(
    "touchSourceMetadata",
    touched?.metadata.consecutiveErrors === 2 && touched.metadata.lastFetchedAt !== null,
  );

  // ---- Soft delete / disable ------------------------------------------
  await updateSource(source.id, { enabled: false, archived: true });
  const disabledSources = await getEnabledSources();
  check("soft-deleted source excluded from enabled", !disabledSources.some((s) => s.id === source.id));

  // ---- Cleanup ---------------------------------------------------------
  const { adminDb: db } = await import("../lib/firebase/admin");
  const batch = db.batch();
  for (const item of items) {
    batch.delete(db.collection("content").doc(buildContentDocId("youtube", item.externalId)));
  }
  batch.delete(db.collection("sources").doc(source.id));
  await batch.commit();
  results.push("cleanup: OK (all verification docs removed)");

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("VERIFICATION CRASHED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
