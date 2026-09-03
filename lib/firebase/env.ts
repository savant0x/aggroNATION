/**
 * Firebase environment validation.
 *
 * Single source of truth for Firebase-related env vars. Throws at import time
 * listing ALL missing variables (not just the first) so misconfiguration fails
 * loudly at build/dev startup instead of silently at runtime.
 */

const REQUIRED_CLIENT_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

const REQUIRED_SERVER_VARS = [
  // Service-account credentials are only required outside the emulator /
  // application-default-credentials environments. Validated lazily by
  // getAdminCredential(), not at import, so `next build` static analysis
  // does not demand prod secrets on the developer machine.
] as const;

function readClientEnv(): Readonly<
  Record<(typeof REQUIRED_CLIENT_VARS)[number], string>
> {
  const missing: string[] = [];
  const values = {} as Record<(typeof REQUIRED_CLIENT_VARS)[number], string>;

  for (const key of REQUIRED_CLIENT_VARS) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
      continue;
    }
    values[key] = value;
  }

  if (missing.length > 0) {
    throw new Error(
      `Firebase client configuration incomplete. Missing environment variables:\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        `\nSee .env.example for the expected shape.`,
    );
  }

  return values;
}

export const firebaseClientEnv = readClientEnv();

export function getFirebaseProjectId(): string {
  return firebaseClientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
}

export { REQUIRED_CLIENT_VARS, REQUIRED_SERVER_VARS };
