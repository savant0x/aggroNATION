/**
 * Source-health decision logic (FID-2026-0905-005 extraction).
 *
 * Pure counterpart to the fetch-service record functions: the auto-disable
 * tracker's rules, separated from all I/O so they are universal and
 * unit-tested. The service owns the writes (metadata touch, updateSource);
 * this module owns the DECISION — same pattern as lib/momentum.ts.
 *
 * Policy (FID-022 sweep finding): only fetch-class failures increment the
 * consecutive-error streak. Configuration-class failures (missing token /
 * API key) are recorded for the operator but never count — a source must
 * not be switched off for lacking credentials the operator still has to
 * add out of band.
 */

/** Consecutive fetch failures after which a source is auto-disabled. */
export const AUTO_DISABLE_THRESHOLD = 5;

export type FailureKind = "fetch" | "config";

export function nextConsecutiveErrors(
  current: number,
  kind: FailureKind,
): number {
  if (kind === "config") {
    return Math.max(0, Math.floor(current) || 0);
  }
  const base = Math.max(0, Math.floor(current) || 0);
  return base + 1;
}

export function shouldAutoDisable(consecutive: number): boolean {
  return Math.max(0, Math.floor(consecutive) || 0) >= AUTO_DISABLE_THRESHOLD;
}
