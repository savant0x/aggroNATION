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

/**
 * FID-2026-0904-005 polish: the desktop cluster is width-budgeted — the
 * username chip only renders ≥2xl (identity is never clipped mid-header;
 * the panel variant always shows it). Sign out is a real bordered button.
 */
export function AuthNav({
  variant = "desktop",
}: {
  variant?: "desktop" | "panel";
}) {
  const isPanel = variant === "panel";
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
    // li (not div): this renders inside a <ul> — keep the DOM valid.
    return <li aria-hidden className={isPanel ? "h-6 w-16" : "h-6 w-16"} />;
  }

  if (!user) {
    return (
      <li className="whitespace-nowrap">
        <Link
          className="text-foreground transition-colors hover:text-accent"
          href="/login"
        >
          Sign in
        </Link>
      </li>
    );
  }

  const signOutButton = (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className={`inline-flex cursor-pointer items-center whitespace-nowrap rounded-full border border-[var(--color-edge)] font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent-bright)] disabled:cursor-not-allowed disabled:opacity-50 ${
        isPanel ? "h-9 px-4 text-sm" : "h-8 px-3.5 text-[13px]"
      }`}
    >
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );

  const username = (
    <span
      className={`block max-w-[9rem] truncate text-[13px] text-muted ${
        isPanel ? "" : "hidden 2xl:inline"
      }`}
      title={user.email ?? undefined}
    >
      {displayNameFor(user.email, user.uid)}
    </span>
  );

  if (isPanel) {
    return (
      <>
        {user.isAdmin && (
          <li className="whitespace-nowrap">
            <Link
              className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground transition-colors hover:text-accent"
              href={siteConfig.adminPath}
            >
              Admin
            </Link>
          </li>
        )}
        <li className="min-w-0 whitespace-nowrap">{username}</li>
        <li className="whitespace-nowrap">{signOutButton}</li>
      </>
    );
  }

  return (
    <>
      {user.isAdmin && (
        <li className="whitespace-nowrap">
          <Link
            className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground transition-colors hover:text-accent"
            href={siteConfig.adminPath}
          >
            Admin
          </Link>
        </li>
      )}
      <li className="min-w-0 whitespace-nowrap">{username}</li>
      <li className="whitespace-nowrap">{signOutButton}</li>
    </>
  );
}
