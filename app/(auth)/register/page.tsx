"use client";

/**
 * Registration page (FID-014, migrated per FID-2026-0904-010).
 *
 * The hosted project has email confirmation enabled, so registration is
 * server-assisted: POST /api/auth/register creates the user via the service
 * role with email_confirm: true, then this page signs the new account in
 * (normal password path) and exchanges the session for the cookie pair.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Input, Label, TextField } from "@heroui/react";

import { supabase } from "@/lib/supabase/client";
import { siteConfig } from "@/config/site";

type FormError = string | null;

/** Map Supabase auth error codes to human messages (no internals leaked). */
function authErrorMessage(code: string, message: string): string {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return "That email already has an account — try signing in instead.";
    case "weak_password":
      return "Password too weak — use at least 6 characters.";
    case "invalid_credentials":
      return "Invalid email or password.";
    case "over_request_rate_limit":
    case "rate_limit_exceeded":
      return "Too many attempts — try again in a minute.";
    case "network_error":
    case "network_request_failed":
      return "Network error — check your connection.";
    default:
      return message || "Registration failed. Try again.";
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
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

  /** Admins land on the dashboard; regular users on the home feed. */
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

  async function handleEmailRegister(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      // Server-assisted create (service role, email auto-confirmed).
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Registration failed.");
      }

      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        throw signInError;
      }
      if (!data.session) {
        throw new Error("Registration failed. Try again.");
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
      const message =
        err instanceof Error ? err.message : "Registration failed.";
      if (message.startsWith("That email") || message.startsWith("Password")) {
        setError(message);
      } else {
        setError(
          code
            ? authErrorMessage(code, message)
            : "Registration failed. Try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex justify-center py-12">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-edge)] bg-[var(--color-raised)] p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted">
          Join {siteConfig.name} — comment on content, and (for admins) manage
          sources.
        </p>

        {error && (
          <Alert status="danger" className="mt-4" role="alert">
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <form
          onSubmit={handleEmailRegister}
          className="mt-6 flex flex-col gap-4"
        >
          <TextField name="displayName" type="text" autoComplete="nickname">
            <Label>Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you'll appear in comments"
              maxLength={60}
            />
          </TextField>

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
            autoComplete="new-password"
            isRequired
          >
            <Label>Password</Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </TextField>

          <Button
            type="submit"
            isDisabled={isSubmitting}
            className="glow-accent mt-2 w-full rounded-xl bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-bright)] font-medium text-white"
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href="/login" className="underline hover:text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
