/**
 * Supabase browser client (FID-2026-0904-010) — anon key, browser + client
 * components, used ONLY for auth (sign-in/sign-up). The app never reads the
 * database from the browser — all data flows through server components and
 * API routes (mirrors the retired Firebase client module contract).
 *
 * Server code must NEVER import from this file — use lib/supabase/admin.ts
 * or lib/supabase/ssr.ts.
 */

"use client";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
