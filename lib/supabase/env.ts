/**
 * Supabase environment validation (FID-2026-0904-010).
 *
 * Single source of truth for Supabase-related env vars. Throws at import time
 * listing ALL missing variables (not just the first).
 *
 * CLIENT-BUNDLE CONTRACT (inherited from FID-012): every NEXT_PUBLIC_* access
 * MUST use a literal key — Next.js inlines `process.env.NEXT_PUBLIC_*` into
 * client bundles only for static references.
 */

const REQUIRED_CLIENT_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

type ClientVarKey = (typeof REQUIRED_CLIENT_VARS)[number];

function readClientEnv(): Readonly<Record<ClientVarKey, string>> {
  // Literal keys ONLY — see module docstring.
  const values: Record<ClientVarKey, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  const missing = REQUIRED_CLIENT_VARS.filter((key) => !values[key]);

  if (missing.length > 0) {
    throw new Error(
      `Supabase client configuration incomplete. Missing environment variables:\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        `\nSee .env.example for the expected shape.`,
    );
  }

  return values as Record<ClientVarKey, string>;
}

export const supabaseClientEnv = readClientEnv();

export function getSupabaseUrl(): string {
  return supabaseClientEnv.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  return supabaseClientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — required for server-side writes.",
    );
  }
  return key;
}
