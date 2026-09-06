/**
 * Momentum baseline decision (FID-2026-0905-004 extraction).
 *
 * Pure counterpart to `refreshMomentumBaselines` in content-repo: decides
 * which rolling day/week baseline patches a metrics blob needs, given the
 * current time. The repo owns the I/O (read rows, apply patches, bounded
 * count); this module owns the DECISION — universal logic, unit-tested
 * (Law 13: one function, one truth; the test suite imports this instead of
 * a server-only module).
 *
 * Windows mirror the repo constants: a baseline is refreshed when absent or
 * older than its window (24h day / 7d week). The patch is always written at
 * the CURRENT rating — the staircase that approximates "rating N ago" and
 * can never lose a gain to per-cycle decay.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export interface MomentumPatch {
  ratingDayAgo?: number;
  ratingDayAgoAt?: string;
  ratingWeekAgo?: number;
  ratingWeekAgoAt?: string;
}

export function momentumPatches(
  metrics: Record<string, unknown> | null | undefined,
  nowMs: number,
): MomentumPatch {
  const m = metrics ?? {};
  const rating = Number(m.rating ?? 0);
  if (!Number.isFinite(rating)) {
    return {};
  }

  const dayAt = m.ratingDayAgoAt ? Date.parse(String(m.ratingDayAgoAt)) : NaN;
  const weekAt = m.ratingWeekAgoAt
    ? Date.parse(String(m.ratingWeekAgoAt))
    : NaN;

  const patch: MomentumPatch = {};
  if (!Number.isFinite(dayAt) || nowMs - dayAt > DAY_MS) {
    patch.ratingDayAgo = rating;
    patch.ratingDayAgoAt = new Date(nowMs).toISOString();
  }
  if (!Number.isFinite(weekAt) || nowMs - weekAt > WEEK_MS) {
    patch.ratingWeekAgo = rating;
    patch.ratingWeekAgoAt = new Date(nowMs).toISOString();
  }
  return patch;
}

const BASELINE_KEYS = [
  "ratingDayAgo",
  "ratingDayAgoAt",
  "ratingWeekAgo",
  "ratingWeekAgoAt",
] as const;

/**
 * FID-2026-0905-008: carry momentum baselines through an upsert.
 *
 * An upsert REPLACES the metrics jsonb; without a carry, every hourly fetch
 * wiped the day/week baselines and the refresher re-seeded them at the fresh
 * rating — baseline == current for every row, so the Rising gate
 * (`rating > ratingDayAgo`) could never pass (probed live: 664/664 equal,
 * delta distribution exactly 0). This pure function merges the four baseline
 * keys from the STORED metrics into the incoming write. Absent/garbage keys
 * stay absent — the refresher owns seeding; this fn only PRESERVES.
 */
export function carryMomentumBaselines(
  stored: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!stored) return incoming;
  const carried: Record<string, unknown> = { ...incoming };
  for (const key of BASELINE_KEYS) {
    const value = stored[key];
    if (value !== null && value !== undefined && !(key in carried)) {
      carried[key] = value;
    }
  }
  return carried;
}
