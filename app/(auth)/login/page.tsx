"use client";

/**
 * Login page (FID-004, migrated per FID-2026-0904-010) — email/password
 * sign-in via supabase-js, exchanging the resulting session for the server
 * cookie pair. Google OAuth is deferred until the hosted project configures
 * the provider (operator decision, recorded in the FID).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, TextField, Input, Label } from "@heroui/react";

import { supabase } from "@/lib/supabase/client";
import { siteConfig } from "@/config/site";

type FormError = string | null;

/** Map Supabase auth error codes to human messages (no internals leaked). */
function authErrorMessage(code: string, message: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "email_not_confirmed":
      return "This email hasn't been confirmed yet.";
    case "over_request_rate_limit":
    case "rate_limit_exceeded":
      return "Too many attempts — try again in a minute.";
    case "network_error":
    case "network_request_failed":
      return "Network error — check your connection.";
    default:
      return message || "Sign-in failed. Try again.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function exchangeForSession(
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, refreshToken }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? "Session establishment failed");
    }
  }

  /** Admins land on the dashboard; regular users on the home feed (FID-009). */
  async function resolvePostLoginPath(): Promise<string> {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
      });
      if (response.ok) {
        const body = (await response.json()) as {
          user?: { isAdmin?: boolean } | null;
        };
        if (body.user?.isAdmin === true) {
          return siteConfig.adminPath;
        }
      }
    } catch {
      // Fall through to the default path.
    }
    return "/";
  }

  async function handleEmailSignIn(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        throw signInError;
      }
      if (!data.session) {
        throw new Error("Sign-in failed. Try again.");
      }
      await exchangeForSession(
        data.session.access_token,
        data.session.refresh_token,
      );
      router.push(await resolvePostLoginPath());
      router.refresh();
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      setError(
        code
          ? authErrorMessage(code, message)
          : message.includes("Session establishment failed")
            ? message
            : "Sign-in failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex justify-center py-12">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)] p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-muted">
          Access the {siteConfig.name} admin dashboard.
        </p>

        {error && (
          <Alert status="danger" className="mt-4" role="alert">
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <form onSubmit={handleEmailSignIn} className="mt-6 flex flex-col gap-4">
          <TextField name="email" type="email" autoComplete="email" isRequired>
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </TextField>

          <TextField
            name="password"
            type="password"
            autoComplete="current-password"
            isRequired
          >
            <Label>Password</Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </TextField>

          <Button
            type="submit"
            isDisabled={isSubmitting}
            className="glow-accent mt-2 w-full rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] font-medium text-white"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          New here?{" "}
          <Link href="/register" className="underline hover:text-accent">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
