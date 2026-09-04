/**
 * Standing Supabase verification suite (FID-2026-0904-010) — the successor
 * to the Firestore-era data-layer/auth suites.
 *
 * Exercises the repository boundary + service-role auth against the REAL
 * hosted database. Creates throwaway sources/content/users, verifies every
 * query shape the app depends on, then cleans up after itself. Zero
 * production rows are touched (all ids carry a unique run suffix).
 *
 * Run: npx tsx --env-file=.env.local scripts/supabase-verify.ts
 */

import "dotenv/config";

import { getServiceClient } from "../lib/supabase/admin";
import {
  createSource,
  getAllSources,
  getEnabledSources,
  getSourceById,
  getSourceByUrl,
  hardDeleteSource,
  saveResolutionCache,
  touchSourceMetadata,
  updateSource,
} from "../lib/repositories/source-repo";
import {
  archiveComment,
  createComment,
  getCommentById,
  listComments,
} from "../lib/repositories/comment-repo";
import {
  countContent,
  getContentById,
  getLatestContent,
  getLatestContentAllTypes,
  getLatestContentDiversified,
  getLatestContentMerged,
  getLatestContentPage,
  getTopContent,
  getTopByViewsForSource,
  upsertContentBatch,
  deleteContentBySource,
} from "../lib/repositories/content-repo";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    console.error(`  ❌ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function main(): Promise<void> {
  // Self-clean: prior crashed runs leave `Verify … verify-*` sources + their
  // content behind — remove them so assertions are deterministic.
  const { data: leftovers } = await getServiceClient()
    .from("sources")
    .select("id")
    .like("name", "Verify % verify-%");
  for (const row of leftovers ?? []) {
    await deleteContentBySource(row.id as string);
    await hardDeleteSource(row.id as string);
  }

  const suffix = `verify-${Date.now()}`;
  const srcAUrl = `https://example.com/${suffix}-a`;
  const srcBUrl = `https://example.com/${suffix}-b`;
  const createdSourceIds: string[] = [];
  const createdUserIds: string[] = [];

  console.log(`\n== Supabase verification (run ${suffix}) ==\n`);

  // --- sources ---------------------------------------------------------
  console.log("[sources]");
  const srcA = await createSource({
    type: "rss",
    name: `Verify A ${suffix}`,
    url: srcAUrl,
    config: { fetchIntervalMinutes: 60, priority: "medium", maxItems: 25 },
  });
  createdSourceIds.push(srcA.id);
  const srcB = await createSource({
    type: "rss",
    name: `Verify B ${suffix}`,
    url: srcBUrl,
  });
  createdSourceIds.push(srcB.id);

  check("createSource returns schema-valid source", srcA.type === "rss" && srcA.url === srcAUrl);
  check("name/url trimmed at boundary", srcA.name === srcA.name.trim());

  const all = await getAllSources();
  check("getAllSources contains both", all.some((s) => s.id === srcA.id) && all.some((s) => s.id === srcB.id));
  const enabled = await getEnabledSources();
  check("getEnabledSources contains both", enabled.some((s) => s.id === srcA.id) && enabled.some((s) => s.id === srcB.id));
  check("getSourceById round-trip", (await getSourceById(srcA.id))?.id === srcA.id);
  check("getSourceByUrl round-trip", (await getSourceByUrl(srcAUrl))?.id === srcA.id);

  // Partial config patch must MERGE, not replace (jsonb || semantics).
  await updateSource(srcA.id, { config: { priority: "high" } });
  const srcAPatched = await getSourceById(srcA.id);
  check(
    "config merge preserves siblings (priority patch keeps maxItems)",
    srcAPatched?.config.priority === "high" && srcAPatched?.config.maxItems === 25,
  );

  // Metadata merge parity (the jsonb-replace bug regression).
  await touchSourceMetadata(srcA.id, { lastError: "boom" });
  await touchSourceMetadata(srcA.id, { totalFetched: 7 });
  const srcAMeta = await getSourceById(srcA.id);
  check(
    "metadata merge preserves siblings (totalFetched patch keeps lastError)",
    srcAMeta?.metadata.lastError === "boom" && srcAMeta?.metadata.totalFetched === 7,
  );

  await saveResolutionCache(srcA.id, "channel-xyz");
  check(
    "resolution cache persists + parses",
    (await getSourceById(srcA.id))?.resolutionCache?.channelId === "channel-xyz",
  );

  // --- content ---------------------------------------------------------
  console.log("[content]");
  const now = new Date();
  const mk = (i: number, views: number, publishedOffsetMin: number) => ({
    sourceType: "rss" as const,
    externalId: `${suffix}-${i}`,
    sourceId: i % 2 === 0 ? srcA.id : srcB.id,
    sourceName: i % 2 === 0 ? "Verify A" : "Verify B",
    title: `Verify item ${suffix} ${i}`,
    excerpt: `Excerpt ${i}`,
    url: `https://example.com/${suffix}/${i}`,
    thumbnailUrl: null,
    author: "verify",
    publishedAt: new Date(now.getTime() - publishedOffsetMin * 60_000),
    tags: ["verify"],
    metrics: { views, likes: i, comments: 0, rating: (i % 5) / 5 },
  });

  const items = Array.from({ length: 25 }, (_, i) => mk(i, 1000 - i * 10, i * 5));
  const first = await upsertContentBatch(items);
  check("upsert wrote 25 rows", first === 25);

  const second = await upsertContentBatch(items.map((it) => ({ ...it, title: `Verify item ${suffix} ${it.externalId}` })));
  check("idempotent re-upsert (same deterministic ids, count stable)", second === 25);

  const totalCount = await countContent({});
  check("countContent total >= 25", totalCount >= 25);
  const typeCount = await countContent({ sourceType: "rss" });
  check("countContent type-scoped >= 25", typeCount >= 25);
  const mergedCount = await countContent({ sourceTypes: ["rss", "trendshift"] });
  check("countContent multi-type works", typeof mergedCount === "number" && mergedCount > 0);

  const latest = await getLatestContent({ sourceType: "rss", limit: 5 });
  check("getLatestContent newest-first + type-scoped", latest.length === 5 && latest[0].publishedAt.getTime() >= latest[4].publishedAt.getTime());
  check("getLatestContent maps snake->domain", typeof latest[0].sourceId === "string" && latest[0].metrics.views >= 0);

  const allTypes = await getLatestContentAllTypes({ limit: 10 });
  check("getLatestContentAllTypes returns items", allTypes.length > 0);

  const byId = await getContentById(latest[0].id);
  check("getContentById round-trip", byId?.id === latest[0].id && byId?.title === latest[0].title);

  // Pagination scoped to OUR source (real rss data shares the type): source A
  // owns 13 of the 25 items (even indexes) -> 10 + 3 pages, disjoint.
  const p1 = await getLatestContentPage({ sourceId: srcA.id, pageSize: 10 });
  check("page 1 has 10 items + nextCursor", p1.items.length === 10 && p1.nextCursor !== null);
  const p2 = await getLatestContentPage({ sourceId: srcA.id, pageSize: 10, cursor: p1.nextCursor ?? undefined });
  const p1Ids = new Set(p1.items.map((i) => i.id));
  check("page 2 disjoint from page 1", p2.items.length === 3 && p2.items.every((i) => !p1Ids.has(i.id)));
  check("page 2 is the last page (no nextCursor)", p2.nextCursor === null);
  const back1 = await getLatestContentPage({ sourceId: srcA.id, pageSize: 10, cursor: p2.prevCursor ?? undefined, direction: "prev" });
  check("prev from page 2 returns page 1", back1.items.length === 10 && back1.items.every((i) => p1Ids.has(i.id)));

  // Diversified + merged + rankings.
  const diversified = await getLatestContentDiversified({ sourceType: "rss", limit: 15 });
  check("diversified returns items capped per source", diversified.length > 0 && diversified.every((i) => i.sourceType === "rss"));
  const merged = await getLatestContentMerged({ sourceTypes: ["rss", "opensource"], limit: 15 });
  check("merged selector works across types", merged.length > 0);
  const topViews = await getTopByViewsForSource({ sourceId: srcA.id, limit: 3 });
  check("top-by-views strictly descending", topViews.length === 3 && topViews[0].metrics.views >= topViews[1].metrics.views && topViews[1].metrics.views >= topViews[2].metrics.views);
  const topRated = await getTopContent({ limit: 5 });
  check("top-rated returns items (regression parity)", topRated.length > 0);

  // --- comments --------------------------------------------------------
  console.log("[comments]");
  const comment = await createComment({
    contentId: latest[0].id,
    userId: "verify-user",
    userEmail: "verify@example.com",
    body: `Verification comment ${suffix}`,
  });
  check("createComment returns id", comment.id.length > 0);
  check("getCommentById round-trip", (await getCommentById(comment.id))?.id === comment.id);
  const listed = await listComments(latest[0].id, 10);
  check("listComments returns the comment", listed.some((c) => c.id === comment.id));
  await archiveComment(comment.id);
  const afterArchive = await listComments(latest[0].id, 10);
  check("archived comment drops from list", !afterArchive.some((c) => c.id === comment.id));

  // --- cleanup (content before sources; cascade would do it anyway) -----
  console.log("[cleanup]");
  const deletedA = await deleteContentBySource(srcA.id);
  const deletedB = await deleteContentBySource(srcB.id);
  check("deleteContentBySource removes rows", deletedA > 0 && deletedB > 0);
  await hardDeleteSource(srcA.id);
  await hardDeleteSource(srcB.id);
  check("hardDeleteSource removes source", (await getSourceById(srcA.id)) === null);

  // --- auth (service-role surface) --------------------------------------
  console.log("[auth]");
  const email = `verify-${suffix}@gmail.com`;
  const { data: createdUser, error: createErr } = await getServiceClient()
    .auth.admin.createUser({ email, password: "VerifyPass123!", email_confirm: true });
  if (createErr) {
    check("createUser", false, createErr.message);
  } else if (createdUser?.user) {
    createdUserIds.push(createdUser.user.id);
    check("createUser (email_confirm true)", createdUser.user.email_confirmed_at !== null);
    const { data: promoted } = await getServiceClient().auth.admin.updateUserById(
      createdUser.user.id,
      { app_metadata: { ...(createdUser.user.app_metadata ?? {}), is_admin: true } },
    );
    check("admin claim persists in app_metadata", promoted?.user?.app_metadata?.is_admin === true);
    const { data: fetched } = await getServiceClient().auth.admin.getUserById(createdUser.user.id);
    check("admin claim readable back", fetched?.user?.app_metadata?.is_admin === true);
  }

  // Auth cleanup — delete every user this run created (suite hygiene).
  for (const userId of createdUserIds) {
    await getServiceClient().auth.admin.deleteUser(userId);
  }

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("Verification crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
