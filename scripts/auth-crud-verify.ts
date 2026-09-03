/**
 * FID-004 + FID-005 end-to-end verification against REAL Firebase Auth +
 * Firestore and the RUNNING dev server.
 *
 * Flow: create test user → REST password sign-in (as the web SDK would) →
 * session exchange → identity probe → non-admin 403 → promote claim →
 * re-login → admin CRUD happy path → duplicate 409 → invalid 422 →
 * soft-delete → cleanup (user + source).
 *
 * Requires the dev server on DEV_SERVER_URL (default :3210).
 */

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const SERVER = process.env.DEV_SERVER_URL ?? "http://127.0.0.1:3210";
const TEST_EMAIL = "fid-004-verify@test.local";
const TEST_PASSWORD = "FidVerify!2026x";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "aggronation-app",
});
const adminAuth = getAuth(app);
const adminDb = getFirestore(app);
const VERIFY_URL = "https://youtube.com/@fid-005-verify";

/** Remove sources left by prior runs (soft-delete keeps the URL reserved). */
async function cleanupPriorSources(): Promise<void> {
  const stale = await adminDb
    .collection("sources")
    .where("url", "==", VERIFY_URL)
    .get();
  for (const doc of stale.docs) {
    await doc.ref.delete();
  }
}

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });

async function identityToolkitSignIn(
  email: string,
  password: string,
): Promise<{ idToken: string } | { error: string }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (!res.ok || !body.idToken) {
    return { error: body.error?.message ?? `HTTP ${res.status}` };
  }
  return { idToken: body.idToken };
}

async function main(): Promise<void> {
  // ---- 0. dev server reachable + clean slate --------------------------
  const health = await fetch(`${SERVER}/api/health`);
  check("dev server health", health.ok);
  await cleanupPriorSources();

  // ---- 1. create test user (server-side) ------------------------------
  const user = await adminAuth.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    emailVerified: true,
    displayName: "FID Verifier",
  });
  check("createUser", user.uid.length > 0);

  try {
    // ---- 2. client-style password sign-in -----------------------------
    const signIn = await identityToolkitSignIn(TEST_EMAIL, TEST_PASSWORD);
    if ("error" in signIn) {
      check("password sign-in", false, signIn.error);
      throw new Error("sign-in failed");
    }
    check("password sign-in (Identity Toolkit REST)", true);
    const idToken = signIn.idToken;

    // ---- 3. session exchange ------------------------------------------
    const sessionRes = await fetch(`${SERVER}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const sessionBody = (await sessionRes.json()) as { ok?: boolean; error?: string };
    check("session exchange", sessionRes.status === 200 && sessionBody.ok === true, sessionBody.error ?? "");
    const setCookie = sessionRes.headers.get("set-cookie") ?? "";
    check(
      "session cookie flags",
      setCookie.includes("HttpOnly") &&
        /samesite=lax/i.test(setCookie) &&
        setCookie.includes("aggro_session="),
    );
    const cookie = setCookie.split(";")[0];

    // ---- 4. identity probe ---------------------------------------------
    const meRes = await fetch(`${SERVER}/api/auth/me`, { headers: { cookie } });
    const meBody = (await meRes.json()) as { user?: { isAdmin?: boolean } };
    check("/api/auth/me 200", meRes.status === 200);
    check("user not admin yet", meBody.user?.isAdmin === false);

    // ---- 5. non-admin hits admin API → 403 -----------------------------
    const forbidden = await fetch(`${SERVER}/api/admin/sources`, { headers: { cookie } });
    check("non-admin GET /api/admin/sources → 403", forbidden.status === 403, `got ${forbidden.status}`);

    // ---- 6. promote to admin (claim) ------------------------------------
    await adminAuth.setCustomUserClaims(user.uid, { admin: true });
    // Session cookies embed claims — force a fresh sign-in/session.
    await adminAuth.revokeRefreshTokens(user.uid);
    const signIn2 = await identityToolkitSignIn(TEST_EMAIL, TEST_PASSWORD);
    if ("error" in signIn2) {
      check("re-sign-in after promote", false, signIn2.error);
      throw new Error("re-sign-in failed");
    }
    const sessionRes2 = await fetch(`${SERVER}/api/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: signIn2.idToken }),
    });
    const cookie2 = (sessionRes2.headers.get("set-cookie") ?? "").split(";")[0];
    const me2 = await fetch(`${SERVER}/api/auth/me`, { headers: { cookie: cookie2 } });
    const me2Body = (await me2.json()) as { user?: { isAdmin?: boolean } };
    check("admin claim visible after re-login", me2Body.user?.isAdmin === true);

    // ---- 7. admin CRUD happy path ---------------------------------------
    const createRes = await fetch(`${SERVER}/api/admin/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookie2 },
      body: JSON.stringify({
        type: "youtube",
        name: "E2E verification source",
        url: VERIFY_URL,
      }),
    });
    const createBody = (await createRes.json()) as { source?: { id?: string } };
    check("admin create source → 201", createRes.status === 201 && Boolean(createBody.source?.id));
    const sourceId = createBody.source?.id as string;

    const dupRes = await fetch(`${SERVER}/api/admin/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookie2 },
      body: JSON.stringify({
        type: "youtube",
        name: "Duplicate",
        url: VERIFY_URL,
      }),
    });
    check("duplicate URL → 409", dupRes.status === 409, `got ${dupRes.status}`);

    const invalidRes = await fetch(`${SERVER}/api/admin/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookie2 },
      body: JSON.stringify({ type: "podcast", name: "", url: "not-a-url" }),
    });
    check("invalid body → 422", invalidRes.status === 422, `got ${invalidRes.status}`);

    const patchRes = await fetch(`${SERVER}/api/admin/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookie2 },
      body: JSON.stringify({ enabled: false, config: { maxItems: 10 } }),
    });
    const patchBody = (await patchRes.json()) as { source?: { enabled?: boolean } };
    check("PATCH → 200 + applied", patchRes.status === 200 && patchBody.source?.enabled === false);

    const delRes = await fetch(`${SERVER}/api/admin/sources/${sourceId}`, {
      method: "DELETE",
      headers: { cookie: cookie2 },
    });
    const delBody = (await delRes.json()) as { deleted?: string };
    check("DELETE → soft delete", delRes.status === 200 && delBody.deleted === "soft");
  } finally {
    // ---- cleanup ---------------------------------------------------------
    await cleanupPriorSources();
    await adminAuth.deleteUser(user.uid).catch(() => undefined);
    console.log("cleanup: test user + verification sources removed");
  }

  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("VERIFICATION CRASHED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
