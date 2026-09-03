/**
 * One-shot ADC probe: verifies applicationDefault credentials (from the
 * firebase-tools refresh token) can authenticate to Firestore and Auth for
 * project aggronation-app. Safe: writes only to a scratch collection and
 * deletes it.
 */

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "aggronation-app",
});

const db = getFirestore(app);

try {
  const ref = db.collection("_adc_probe").doc("probe");
  await ref.set({ ok: true, at: new Date() });
  const snap = await ref.get();
  console.log("firestore write/read:", snap.exists ? "OK" : "FAILED");
  await ref.delete();
  console.log("firestore delete: OK");

  // List a single auth user page to prove the IAM include for Auth.
  const users = await getAuth(app).listUsers(1);
  console.log("auth listUsers: OK (returned", users.users.length, "user(s))");

  console.log("ADC FULLY FUNCTIONAL");
  process.exit(0);
} catch (error) {
  console.error("ADC PROBE FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
}
