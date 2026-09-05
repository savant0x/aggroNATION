import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTO_DISABLE_THRESHOLD,
  nextConsecutiveErrors,
  shouldAutoDisable,
} from "../lib/source-health";

/**
 * Auto-disable tracker tests (FID-2026-0905-005). The policy this pins:
 * fetch failures increment the streak, config failures never do, and the
 * source is auto-disabled exactly at the threshold — not before, not after.
 */

describe("AUTO_DISABLE_THRESHOLD", () => {
  it("pins the operator-approved policy value (mutation tripwire)", () => {
    // Written absolutely, not relative to the constant: changing the
    // policy value must fail here so it is a conscious, reviewed decision.
    assert.equal(AUTO_DISABLE_THRESHOLD, 5);
  });
});

describe("nextConsecutiveErrors", () => {
  it("increments on a fetch failure", () => {
    assert.equal(nextConsecutiveErrors(0, "fetch"), 1);
    assert.equal(nextConsecutiveErrors(4, "fetch"), 5);
  });

  it("never increments on a config failure (FID-022 policy)", () => {
    assert.equal(nextConsecutiveErrors(0, "config"), 0);
    assert.equal(nextConsecutiveErrors(4, "config"), 4);
  });

  it("clamps invalid current values defensively", () => {
    assert.equal(nextConsecutiveErrors(-3, "fetch"), 1);
    assert.equal(nextConsecutiveErrors(Number.NaN, "fetch"), 1);
    assert.equal(nextConsecutiveErrors(2.7, "fetch"), 3);
    assert.equal(nextConsecutiveErrors(-3, "config"), 0);
  });
});

describe("shouldAutoDisable", () => {
  it("does not disable below the threshold", () => {
    assert.equal(shouldAutoDisable(0), false);
    assert.equal(shouldAutoDisable(AUTO_DISABLE_THRESHOLD - 1), false);
  });

  it("disables exactly at the threshold and beyond", () => {
    assert.equal(shouldAutoDisable(AUTO_DISABLE_THRESHOLD), true);
    assert.equal(shouldAutoDisable(AUTO_DISABLE_THRESHOLD + 1), true);
  });

  it("clamps invalid values defensively", () => {
    assert.equal(shouldAutoDisable(-1), false);
    assert.equal(shouldAutoDisable(Number.NaN), false);
    assert.equal(shouldAutoDisable(4.9), false);
  });
});
