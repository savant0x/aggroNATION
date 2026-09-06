import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { carryMomentumBaselines, momentumPatches } from "../lib/momentum";

/**
 * Baseline-carry tests (FID-2026-0905-008). The carry is the fix for the
 * Rising-never-populates bug: hourly upserts replaced the metrics jsonb,
 * wiping ratingDayAgo/ratingWeekAgo, so the refresher re-seeded at the fresh
 * rating and every delta was exactly 0 (probed live: 664/664 rows equal).
 * The carry must PRESERVE stored baselines through an upsert and never
 * invent them.
 */

describe("carryMomentumBaselines", () => {
  it("carries all four baseline keys from stored into incoming", () => {
    const stored = {
      rating: 0.4,
      ratingDayAgo: 0.35,
      ratingDayAgoAt: "2026-09-04T00:00:00.000Z",
      ratingWeekAgo: 0.3,
      ratingWeekAgoAt: "2026-08-29T00:00:00.000Z",
    };
    const incoming = { likes: 10, comments: 2, rating: 0.42 };
    const result = carryMomentumBaselines(stored, incoming);
    assert.equal(result.ratingDayAgo, 0.35);
    assert.equal(result.ratingWeekAgo, 0.3);
    assert.equal(result.ratingDayAgoAt, "2026-09-04T00:00:00.000Z");
    assert.equal(result.rating, 0.42);
    assert.equal(result.likes, 10);
  });

  it("incoming values win when the key already exists", () => {
    const stored = { ratingDayAgo: 0.35, ratingWeekAgo: 0.3 };
    const incoming = { rating: 0.5, ratingDayAgo: 0.99 };
    const result = carryMomentumBaselines(stored, incoming);
    assert.equal(result.ratingDayAgo, 0.99);
    assert.equal(result.ratingWeekAgo, 0.3);
  });

  it("carries nothing when stored metrics are absent", () => {
    const incoming = { rating: 0.4 };
    assert.deepEqual(carryMomentumBaselines(null, incoming), incoming);
    assert.deepEqual(carryMomentumBaselines(undefined, incoming), incoming);
  });

  it("does not invent baselines when stored lacks them", () => {
    const stored = { rating: 0.4, prevRating: 0.4 };
    const result = carryMomentumBaselines(stored, { rating: 0.41 });
    assert.equal("ratingDayAgo" in result, false);
    assert.equal("ratingWeekAgo" in result, false);
  });

  it("ignores null/undefined stored baseline values", () => {
    const stored = {
      ratingDayAgo: null,
      ratingWeekAgo: undefined,
      ratingDayAgoAt: "2026-09-04T00:00:00.000Z",
    };
    const result = carryMomentumBaselines(stored, { rating: 0.4 });
    assert.equal("ratingDayAgo" in result, false);
    assert.equal("ratingWeekAgo" in result, false);
    assert.equal(result.ratingDayAgoAt, "2026-09-04T00:00:00.000Z");
  });

  it("does not mutate the incoming object", () => {
    const incoming = { rating: 0.4 };
    carryMomentumBaselines({ ratingDayAgo: 0.35 }, incoming);
    assert.equal("ratingDayAgo" in incoming, false);
  });

  it("end-to-end: carried baseline older than a window lets the refresher reseed", () => {
    // After a carry, the refresher sees a baseline timestamp OLDER than the
    // window and reseeds at the new rating — the staircase advances instead
    // of flattening.
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const carried = carryMomentumBaselines(
      {
        ratingDayAgo: 0.3,
        ratingDayAgoAt: new Date(now - 2 * dayMs).toISOString(),
      },
      { rating: 0.5 },
    );
    const patch = momentumPatches(carried, now);
    assert.equal(patch.ratingDayAgo, 0.5);
  });
});
