/**
 * Promote a Firebase Auth user to admin (FID-004 bootstrap).
 *
 * Usage:
 *   FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=... \
 *     npx tsx scripts/promote-admin.ts <uid-or-email>
 *
 * Requires service-account credentials (or ADC with project access).
 * Sets the `admin` custom claim consumed by Firestore rules and
 * lib/auth/session.ts, and ensures the /users/{uid} profile doc exists.
 */

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: tsx scripts/promote-admin.ts <uid-or-email>");
    process.exit(1);
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  const app = getApps()[0] ?? initializeApp({
    credential:
      clientEmail && rawKey
        ? cert({ clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") })
        : applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "aggronation-app",
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  const user = target.includes("@")
    ? await auth.getUserByEmail(target)
    : await auth.getUser(target);

  await auth.setCustomUserClaims(user.uid, { admin: true });

  await db.collection("users").doc(user.uid).set(
    {
      email: user.email ?? null,
      promotedToAdminAt: new Date(),
    },
    { merge: true },
  );

  console.log(`✅ ${user.email ?? user.uid} is now an admin (uid: ${user.uid})`);
  console.log("   Claim takes effect on next sign-in / session refresh.");
}

main().catch((error: unknown) => {
  console.error("Promotion failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
