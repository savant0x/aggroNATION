import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeRating,
  engagementScore,
  freshnessScore,
  FRESHNESS_DECAY_DAYS,
} from "../lib/fetchers/rating";

/**
 * Rating tests (FID-2026-0905-004). The formula is the ranking core —
 * every weight change must be a conscious decision caught here.
 */

const DAY = 24 * 60 * 60 * 1000;

describe("engagementScore", () => {
  it("is zero with no likes or comments", () => {
    assert.equal(engagementScore(1000, 0, 0), 0);
  });

  it("is zero with zero or negative views", () => {
    assert.equal(engagementScore(0, 10, 10), 0);
    assert.equal(engagementScore(-5, 10, 10), 0);
  });

  it("weights likes x2 and comments x3 against views", () => {
    // (50*2 + 10*3) / 1000 = 130/1000 = 0.13
    assert.equal(engagementScore(1000, 50, 10), 0.13);
  });

  it("clamps to 1 when engagement exceeds saturation", () => {
    assert.equal(engagementScore(10, 100, 100), 1);
  });
});

describe("freshnessScore", () => {
  it("is 1 at publish time", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    assert.equal(freshnessScore(now, now), 1);
  });

  it("is exp(-1) at the decay constant (14 days)", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const then = new Date(now.getTime() - FRESHNESS_DECAY_DAYS * DAY);
    assert.ok(Math.abs(freshnessScore(then, now) - Math.exp(-1)) < 1e-9);
  });

  it("clamps future publish dates to 1", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const future = new Date(now.getTime() + 7 * DAY);
    assert.equal(freshnessScore(future, now), 1);
  });
});

describe("computeRating", () => {
  const now = new Date("2026-09-05T12:00:00Z");

  it("blends engagement and freshness with the declared weights", () => {
    const published = new Date(now.getTime() - 14 * DAY);
    const engagement = engagementScore(1000, 50, 10); // 0.13
    const freshness = Math.exp(-1); // ~0.3679
    const expected = engagement * 0.6 + freshness * 0.4;
    const rating = computeRating({
      views: 1000,
      likes: 50,
      comments: 10,
      publishedAt: published,
      now,
    });
    assert.ok(Math.abs(rating - expected) < 1e-9);
  });

  it("never exceeds 1 even at maximum engagement and freshness", () => {
    const rating = computeRating({
      views: 1,
      likes: 1000,
      comments: 1000,
      publishedAt: now,
      now,
    });
    assert.equal(rating, 1);
  });

  it("treats NaN inputs as zero (defensive clamp)", () => {
    const rating = computeRating({
      views: Number.NaN,
      likes: Number.NaN,
      comments: Number.NaN,
      publishedAt: now,
      now,
    });
    assert.equal(rating, freshnessScore(now, now) * 0.4);
  });
});
