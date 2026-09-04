import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3100";
const suffix = Date.now();
const email = `live-${suffix}@gmail.com`;
const password = "LivePass123!";

const cookieJar = new Map<string, string>();
async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const cookies = Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookies) headers.set("cookie", cookies);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return res;
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    console.error(`  ❌ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("\n== LIVE SERVER AUTH FLOW ==\n");

  // 1. Register via the server-assisted route.
  const reg = await api("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Live Probe" }),
  });
  check("register returns 200", reg.status === 200);

  // 2. Sign in client-style (anon key) and exchange for the SSR cookie pair.
  const { data: sessionData, error: signInError } = await createClient(
    url,
    anon,
  ).auth.signInWithPassword({ email, password });
  check("client sign-in works", !signInError && !!sessionData.session, signInError?.message);
  const accessToken = sessionData.session!.access_token;
  const refreshToken = sessionData.session!.refresh_token;

  const exch = await api("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, refreshToken }),
  });
  check("session exchange 200", exch.status === 200, await exch.text());
  check("session cookies set", cookieJar.size >= 1, Array.from(cookieJar.keys()));

  // 3. /me should reflect the authenticated non-admin user.
  const me1 = await api("/api/auth/me");
  const me1Body = (await me1.json()) as { user?: { isAdmin?: boolean } };
  check(
    "me returns non-admin user",
    me1.status === 200 && me1Body.user?.isAdmin === false,
    { status: me1.status, body: me1Body, jar: Array.from(cookieJar.keys()) },
  );

  // 4. Admin gate: fetch route must 403 for non-admin.
  const fetch403 = await api("/api/admin/fetch", { method: "POST" });
  check("admin fetch 403 for non-admin", fetch403.status === 403);

  // 5. Promote to admin, re-login for a fresh claim, /me shows admin.
  const { data: created } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = created.users.find((u) => u.email === email);
  check("promote target found", !!user);
  if (user) {
    await service.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), is_admin: true },
    });
    await service.from("profiles").upsert(
      { id: user.id, email, is_admin: true },
      { onConflict: "id" },
    );
  }
  // Force a fresh token (claim lands on refresh).
  const { error: signOutErr } = await createClient(url, anon).auth.signOut();
  void signOutErr;
  const { data: s2 } = await createClient(url, anon).auth.signInWithPassword({
    email,
    password,
  });
  const me2res = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: s2.session!.access_token,
      refreshToken: s2.session!.refresh_token,
    }),
  });
  const me2 = await api("/api/auth/me");
  const me2Body = (await me2.json()) as { user?: { isAdmin?: boolean } };
  check("me shows admin after promote + relogin", me2.status === 200 && me2Body.user?.isAdmin === true);

  // 6. Logout clears the session.
  const out = await api("/api/auth/logout", { method: "POST" });
  const me3 = await api("/api/auth/me");
  check("logout: me is 401 after", me3.status === 401, `${out.status}`);

  // 7. Cron fetch with the secret — runs the REAL pipeline.
  const cronSecret = process.env.CRON_SECRET!;
  const fetchRes = await fetch(`${BASE}/api/cron/fetch`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const fetchBody = (await fetchRes.json()) as { ok: boolean; okCount?: number; failCount?: number };
  check("cron fetch authorized + ran", fetchRes.status === 200 && fetchBody.ok === true, fetchBody);
  console.log(`      cron outcomes: ok=${fetchBody.okCount} fail=${fetchBody.failCount}`);

  // Cleanup the throwaway user.
  if (user) {
    await service.auth.admin.deleteUser(user.id);
  }

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Probe crashed:", e.message);
  process.exit(1);
});
