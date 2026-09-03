/**
 * Inspect the raw Set-Cookie header returned by /api/auth/session to verify
 * cookie flags (HttpOnly, SameSite, Secure-in-prod, name, path, maxAge).
 * Creates a temporary user, signs in via REST, cleans up.
 */

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "aggronation-app",
});
const auth = getAuth(app);
const SERVER = process.env.DEV_SERVER_URL ?? "http://127.0.0.1:3210";

async function main(): Promise<void> {
  const user = await auth.createUser({
    email: "cookie-flag-probe@test.local",
    password: "CookieProbe!2026",
    emailVerified: true,
  });

  try {
    const si = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "cookie-flag-probe@test.local",
          password: "CookieProbe!2026",
          returnSecureToken: true,
        }),
      },
    );
    const { idToken } = (await si.json()) as { idToken?: string };
    if (!idToken) throw new Error("no idToken from sign-in");

    const res = await fetch(`${SERVER}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    console.log("status:", res.status);
    console.log("raw set-cookie:", JSON.stringify(res.headers.get("set-cookie")));
  } finally {
    await auth.deleteUser(user.uid);
    console.log("cleanup: probe user deleted");
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
