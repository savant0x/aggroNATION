/**
 * Promote a Supabase user to admin (FID-004 bootstrap, migrated per
 * FID-2026-0904-010).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/promote-admin.ts <uid-or-email>
 *
 * Uses the service-role client. Sets `app_metadata.is_admin` (the JWT claim
 * lib/auth/session.ts reads — the Firebase custom-claim analog) and mirrors
 * it in the profiles table. Takes effect on the user's next token refresh /
 * re-sign-in (identical to the Firebase behavior).
 */

import "dotenv/config";

import { getServiceClient } from "../lib/supabase/admin";

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: tsx scripts/promote-admin.ts <uid-or-email>");
    process.exit(1);
  }

  const adminAuth = getServiceClient().auth.admin;

  let uid: string;
  let email: string | null;
  if (target.includes("@")) {
    // Admin API has no getUserByEmail — page through users (tiny user base).
    const { data, error } = await adminAuth.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email === target);
    if (!match) {
      console.error(`No user found with email ${target}.`);
      process.exit(1);
    }
    uid = match.id;
    email = match.email ?? null;
  } else {
    const { data, error } = await adminAuth.getUserById(target);
    if (error) throw new Error(error.message);
    if (!data.user) {
      console.error(`No user found with uid ${target}.`);
      process.exit(1);
    }
    uid = data.user.id;
    email = data.user.email ?? null;
  }

  // Read current app_metadata first — updateUserById REPLACES the object.
  const { data: existing } = await adminAuth.getUserById(uid);
  const appMetadata = {
    ...(existing?.user?.app_metadata ?? {}),
    is_admin: true,
  };
  await adminAuth.updateUserById(uid, { app_metadata: appMetadata });

  await getServiceClient().from("profiles").upsert(
    {
      id: uid,
      email,
      is_admin: true,
    },
    { onConflict: "id" },
  );

  console.log(`✅ ${email ?? uid} is now an admin (uid: ${uid})`);
  console.log("   Claim takes effect on next sign-in / token refresh.");
}

main().catch((error: unknown) => {
  console.error(
    "Promotion failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
