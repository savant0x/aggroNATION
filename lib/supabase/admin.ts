/**
 * Supabase admin client (FID-2026-0904-010) — service_role key, server only.
 *
 * HARD BOUNDARY: the "server-only" import makes any client-bundle import of
 * this module a build error. Never import from client components.
 *
 * Mirrors the retired Firebase admin module: the service_role key bypasses RLS (the
 * Admin-SDK-parity model — all writes and all server reads flow through this
 * client; RLS guards the anon/authenticated roles as defense-in-depth).
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client for writes, admin reads, and admin auth operations
 * (user management, admin claims). Idempotent singleton.
 */
export function getServiceClient(): SupabaseClient {
  if (cached) {
    return cached;
  }
  cached = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}

export const serviceClient = getServiceClient;

/** Convenience: service-role auth admin (createUser, updateUserById, …). */
export const adminAuth = () => getServiceClient().auth.admin;

/** Placeholder to keep the anon key import honest (browser client owns it). */
export { getSupabaseAnonKey };
