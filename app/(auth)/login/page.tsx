"use client";

/**
 * Login page (FID-004) — email/password + Google sign-in via the web SDK,
 * exchanging the resulting ID token for a server session cookie.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, TextField, Input, Label } from "@heroui/react";

import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";

import {
  auth,
  googleProvider,
  connectToEmulatorsIfConfigured,
} from "@/lib/firebase/client";
import { siteConfig } from "@/config/site";

type FormError = string | null;

/** Map Firebase auth error codes to human messages (no internals leaked). */
function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts — try again in a minute.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup — allow popups and retry.";
    case "auth/network-request-failed":
      return "Network error — check your connection.";
    default:
      return "Sign-in failed. Try again.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function exchangeForSession(idToken: string): Promise<void> {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? "Session establishment failed");
    }
  }

  async function handleEmailSignIn(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await connectToEmulatorsIfConfigured();
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await exchangeForSession(await credential.user.getIdToken());
      router.push("/");
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      setError(
        code.startsWith("auth/")
          ? authErrorMessage(code)
          : err instanceof Error
            ? err.message
            : "Sign-in failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    setError(null);
    setIsSubmitting(true);
    try {
      await connectToEmulatorsIfConfigured();
      const credential = await signInWithPopup(auth, googleProvider);
      await exchangeForSession(await credential.user.getIdToken());
      router.push("/");
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      setError(
        code.startsWith("auth/")
          ? authErrorMessage(code)
          : err instanceof Error
            ? err.message
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

        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-[var(--color-edge)]" />
          or
          <span className="h-px flex-1 bg-[var(--color-edge)]" />
        </div>

        <Button
          variant="tertiary"
          onPress={handleGoogleSignIn}
          isDisabled={isSubmitting}
          className="w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)]"
        >
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-xs text-muted">
          Admin access is granted by the operator.{" "}
          <Link href="/" className="underline hover:text-accent">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
