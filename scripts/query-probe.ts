/**
 * Query consistency probe: writes a doc then immediately queries it by
 * field, printing everything. Diagnoses why where-queries return empty
 * while direct reads succeed.
 */

import { adminDb } from "../lib/firebase/admin";

async function main(): Promise<void> {
  const ref = adminDb.collection("_query_probe").doc("p1");
  await ref.set({ kind: "probe", flag: false, url: "https://example.com/probe" });

  const direct = await ref.get();
  console.log("direct read exists:", direct.exists, "data:", JSON.stringify(direct.data()));

  const all = await adminDb.collection("_query_probe").get();
  console.log("unfiltered query docs:", all.size, [...all.docs].map((d) => d.id).join(","));

  const byFlag = await adminDb.collection("_query_probe").where("flag", "==", false).get();
  console.log("flag==false query:", byFlag.size);

  const byUrl = await adminDb.collection("_query_probe").where("url", "==", "https://example.com/probe").get();
  console.log("url== query:", byUrl.size);

  await ref.delete();
  console.log("probe doc deleted");
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
