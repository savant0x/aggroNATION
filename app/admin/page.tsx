import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getAllSources } from "@/lib/repositories/source-repo";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import type { Source } from "@/lib/schemas/content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
};

async function loadSources(): Promise<{
  sources: Source[];
  error: string | null;
}> {
  try {
    return { sources: await getAllSources(), error: null };
  } catch (error) {
    console.error("[admin] Failed to load sources:", error);
    return {
      sources: [],
      error: "Failed to load sources — check server logs.",
    };
  }
}

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.isAdmin) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Admin access required
        </h1>
        <p className="max-w-md text-muted">
          You&apos;re signed in, but this account doesn&apos;t carry the admin
          claim. Access is granted by the operator via the promote-admin script.
        </p>
        <Link
          href="/"
          className="rounded-full border border-[var(--color-edge)] bg-[var(--color-surface)] px-5 py-2 text-sm font-medium transition-colors hover:border-[var(--color-accent)]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  const { sources, error } = await loadSources();

  return (
    <div className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Source management
        </h1>
        <p className="text-sm text-muted">
          Signed in as {user.email ?? user.uid} — content sources, fetch
          controls, and pipeline health.
        </p>
      </header>

      <AdminDashboard initialSources={sources} loadError={error} />
    </div>
  );
}
