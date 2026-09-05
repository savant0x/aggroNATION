import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DAY_MS, momentumPatches, WEEK_MS } from "../lib/momentum";

/**
 * Momentum baseline tests (FID-2026-0905-004): the extracted decision logic
 * behind Rising (FID-2026-0905-002 self-correct). A baseline must refresh
 * exactly when absent or older than its window — never sooner (that would
 * erase real deltas), never later (that would serve stale momentum).
 */

const NOW = 1_700_000_000_000;

describe("momentumPatches", () => {
  it("seeds both baselines on first sight (absent metrics)", () => {
    const patch = momentumPatches({ rating: 0.5 }, NOW);
    assert.equal(patch.ratingDayAgo, 0.5);
    assert.equal(patch.ratingWeekAgo, 0.5);
    assert.equal(patch.ratingDayAgoAt, new Date(NOW).toISOString());
    assert.equal(patch.ratingWeekAgoAt, new Date(NOW).toISOString());
  });

  it("treats null/undefined metrics as first sight", () => {
    for (const m of [null, undefined, {}]) {
      const patch = momentumPatches(m, NOW);
      // A full seed is four fields: day + week values AND their timestamps.
      assert.equal(Object.keys(patch).length, 4);
      assert.notEqual(patch.ratingDayAgo, undefined);
      assert.notEqual(patch.ratingWeekAgo, undefined);
    }
  });

  it("returns nothing when both baselines are fresh", () => {
    const metrics = {
      rating: 0.6,
      ratingDayAgoAt: new Date(NOW - DAY_MS + 60_000).toISOString(),
      ratingWeekAgoAt: new Date(NOW - WEEK_MS + 60_000).toISOString(),
    };
    assert.deepEqual(momentumPatches(metrics, NOW), {});
  });

  it("refreshes only the day baseline when it ages past 24h", () => {
    const metrics = {
      rating: 0.7,
      ratingDayAgoAt: new Date(NOW - DAY_MS - 1).toISOString(),
      ratingWeekAgoAt: new Date(NOW - 2 * DAY_MS).toISOString(),
    };
    const patch = momentumPatches(metrics, NOW);
    assert.equal(patch.ratingDayAgo, 0.7);
    assert.equal(patch.ratingDayAgoAt, new Date(NOW).toISOString());
    assert.equal(patch.ratingWeekAgo, undefined);
    assert.equal(patch.ratingWeekAgoAt, undefined);
  });

  it("refreshes only the week baseline when it ages past 7d", () => {
    const metrics = {
      rating: 0.4,
      ratingDayAgoAt: new Date(NOW - 3_600_000).toISOString(),
      ratingWeekAgoAt: new Date(NOW - WEEK_MS - 1).toISOString(),
    };
    const patch = momentumPatches(metrics, NOW);
    assert.equal(patch.ratingWeekAgo, 0.4);
    assert.equal(patch.ratingDayAgo, undefined);
  });

  it("treats malformed timestamps as absent (defensive)", () => {
    const patch = momentumPatches(
      { rating: 0.3, ratingDayAgoAt: "not-a-date", ratingWeekAgoAt: "" },
      NOW,
    );
    assert.equal(patch.ratingDayAgo, 0.3);
    assert.equal(patch.ratingWeekAgo, 0.3);
  });

  it("treats non-finite ratings as nothing-to-do", () => {
    assert.deepEqual(momentumPatches({ rating: "garbage" }, NOW), {});
    assert.deepEqual(momentumPatches({ rating: Number.NaN }, NOW), {});
  });
});
