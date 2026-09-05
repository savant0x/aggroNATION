/**
 * Shared cron-route authorization (FID-2026-0905-001).
 *
 * One owner for the timing-safe Bearer-secret compare used by every external
 * scheduler entry point (currently /api/cron/fetch and /api/cron/purge).
 * The secret never travels in a query parameter; comparison runs over
 * pre-hashed SHA-256 buffers so length differences and early exits leak
 * nothing.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

export function isCronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) {
    return false;
  }

  const providedHash = new Uint8Array(
    createHash("sha256").update(match[1]).digest(),
  );
  const expectedHash = new Uint8Array(
    createHash("sha256").update(expected).digest(),
  );

  return timingSafeEqual(providedHash, expectedHash);
}
