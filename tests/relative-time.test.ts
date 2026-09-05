import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { relativeTime } from "../lib/format/relative-time";

/**
 * relativeTime tests (FID-2026-0905-004): pins the exact vocabulary so the
 * freshness stamps, status page, and hero never drift apart.
 */

const NOW = Date.now();

describe("relativeTime", () => {
  it("returns never for null", () => {
    assert.equal(relativeTime(null), "never");
  });

  it("shows seconds under a minute", () => {
    assert.equal(relativeTime(new Date(NOW - 59_000)), "59s ago");
  });

  it("shows minutes at and above a minute", () => {
    assert.equal(relativeTime(new Date(NOW - 60_000)), "1m ago");
    assert.equal(relativeTime(new Date(NOW - 59 * 60_000)), "59m ago");
  });

  it("shows hours at and above an hour", () => {
    assert.equal(relativeTime(new Date(NOW - 3_600_000)), "1h ago");
    assert.equal(relativeTime(new Date(NOW - 23 * 3_600_000)), "23h ago");
  });

  it("shows days at and above a day", () => {
    assert.equal(relativeTime(new Date(NOW - 86_400_000)), "1d ago");
    assert.equal(relativeTime(new Date(NOW - 40 * 86_400_000)), "40d ago");
  });

  it("clamps future dates to now (0s ago)", () => {
    assert.equal(relativeTime(new Date(NOW + 5 * 60_000)), "0s ago");
  });
});
