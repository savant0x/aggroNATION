/**
 * FID-003 fetch-service cycle verification against real Firestore:
 * seed two sources (youtube + unsupported rss) → runFetchAllSources() →
 * assert outcomes + metadata error recording → clean up seeded sources.
 *
 * NOTE: without YOUTUBE_API_KEY the youtube source errors fast — which is
 * exactly the failure-isolation + error-recording path being verified.
 */

import { adminDb } from "../lib/firebase/admin";
import {
  createSource,
  getSourceById,
} from "../lib/repositories/source-repo";
import { runFetchAllSources } from "../lib/services/fetch-service";

async function main(): Promise<void> {
  const yt = await createSource({
    type: "youtube",
    name: "FID-003 verify (youtube)",
    url: "https://www.youtube.com/@TwoMinutePapers",
  });
  const rss = await createSource({
    type: "rss",
    name: "FID-003 verify (rss)",
    url: "https://example.com/feed.xml",
  });
  console.log("seeded sources:", yt.id, rss.id);

  const result = await runFetchAllSources();
  console.log(
    JSON.stringify(
      {
        total: result.totalSources,
        succeeded: result.succeeded,
        failed: result.failed,
        outcomes: result.outcomes.map((o) => ({
          type: o.sourceType,
          ok: o.ok,
          error: o.error?.slice(0, 80),
        })),
      },
      null,
      1,
    ),
  );

  // Metadata error recording check.
  const ytAfter = await getSourceById(yt.id);
  console.log(
    "youtube source recorded failure:",
    ytAfter?.metadata.lastError !== null,
    "| consecutiveErrors:",
    ytAfter?.metadata.consecutiveErrors,
  );

  // Cleanup — remove seeded sources (operator registers real ones later).
  await adminDb.collection("sources").doc(yt.id).delete();
  await adminDb.collection("sources").doc(rss.id).delete();
  console.log("cleanup: seeded sources removed");

  const rssOutcome = result.outcomes.find((o) => o.sourceType === "rss");
  const ytOutcome = result.outcomes.find((o) => o.sourceType === "youtube");

  const pass =
    result.totalSources === 2 &&
    rssOutcome?.error?.includes("not implemented") === true &&
    ytAfter?.metadata.lastError !== null;

  console.log(pass ? "FETCH SERVICE CYCLE: PASS" : "FETCH SERVICE CYCLE: FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
