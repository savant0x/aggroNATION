/**
 * Content rating (FID-003).
 *
 * rating = engagement * 0.6 + freshness * 0.4, clamped to [0, 1].
 *
 * - engagement = clamp((likes*2 + comments*3) / views, 0, 1)
 *   Comments weighted above likes: a comment costs the viewer more effort,
 *   so it signals quality more strongly. Normalized against views so a viral
 *   video with average engagement does not dominate.
 * - freshness = exp(-ageDays / 14) — smooth ~2-week decay. Tunable constant;
 *   changing it re-scores content on the next fetch pass (rating is a stored
 *   snapshot, not derived at read time).
 */

export interface RatingInput {
  views: number;
  likes: number;
  comments: number;
  publishedAt: Date;
  /** Reference point for age computation. Defaults to now. */
  now?: Date;
}

/** Weight of the engagement component in the final score. */
export const ENGAGEMENT_WEIGHT = 0.6;
/** Weight of the freshness component in the final score. */
export const FRESHNESS_WEIGHT = 0.4;
/** Decay constant in days: freshness halves roughly every ~10 days. */
export const FRESHNESS_DECAY_DAYS = 14;

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function engagementScore(
  views: number,
  likes: number,
  comments: number,
): number {
  if (views <= 0) {
    return 0;
  }
  return clamp01((likes * 2 + comments * 3) / views);
}

export function freshnessScore(
  publishedAt: Date,
  now: Date = new Date(),
): number {
  const ageMs = Math.max(0, now.getTime() - publishedAt.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return Math.exp(-ageDays / FRESHNESS_DECAY_DAYS);
}

export function computeRating(input: RatingInput): number {
  const engagement = engagementScore(input.views, input.likes, input.comments);
  const freshness = freshnessScore(input.publishedAt, input.now);
  return clamp01(engagement * ENGAGEMENT_WEIGHT + freshness * FRESHNESS_WEIGHT);
}
