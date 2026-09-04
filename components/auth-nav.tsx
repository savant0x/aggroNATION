"use client";

/**
 * Navbar auth affordance (FID-014). ONE component, ONE /api/auth/me probe
 * (Law 13 — replaces the admin-only AdminNavLink). Three states:
 *   signed-out  → "Sign in" link (so logout is never a dead end)
 *   signed-in   → display/email chip + Sign out
 *   admin       → additionally the Admin link
 * The /admin server page and Firestore rules remain the real gates.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { siteConfig } from "@/config/site";

interface MeResponse {
  user: {
    uid: string;
    email: string | null;
    isAdmin: boolean;
  } | null;
}

function displayNameFor(email: string | null, uid: string): string {
  if (!email) return `user-${uid.slice(0, 6)}`;
  const local = email.split("@")[0];
  return local.length > 0 ? local : "user";
}

export function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse["user"]>(null);
  const [probed, setProbed] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function probe(): Promise<void> {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
        });
        if (!cancelled && response.ok) {
          const body = (await response.json()) as MeResponse;
          setUser(body.user);
        }
      } catch {
        // Probe failure = signed-out UI.
      } finally {
        if (!cancelled) {
          setProbed(true);
        }
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut(): Promise<void> {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  if (!probed) {
    // Brief neutral placeholder until the probe resolves (first paint only).
    return <div aria-hidden className="h-6 w-16" />;
  }

  if (!user) {
    return (
      <li>
        <Link
          className="text-foreground transition-colors hover:text-accent"
          href="/login"
        >
          Sign in
        </Link>
      </li>
    );
  }

  return (
    <>
      {user.isAdmin && (
        <li>
          <Link
            className="text-foreground transition-colors hover:text-accent"
            href={siteConfig.adminPath}
          >
            Admin
          </Link>
        </li>
      )}
      <li>
        <span className="text-sm text-muted" title={user.email ?? undefined}>
          {displayNameFor(user.email, user.uid)}
        </span>
      </li>
      <li>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="cursor-pointer text-sm text-muted transition-colors hover:text-accent disabled:opacity-50"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </li>
    </>
  );
}
