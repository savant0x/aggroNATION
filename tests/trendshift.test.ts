import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalizeTrendshiftUrl } from "../lib/fetchers/trendshift";

/**
 * Trendshift canonicalization tests (FID-2026-0905-004). The /api refusal
 * is the robots.txt law (FID-2026-0904-003): the transport layer must never
 * fetch a disallowed path, even if handed one.
 */

describe("canonicalizeTrendshiftUrl", () => {
  it("canonicalizes the root listing with the default sort", () => {
    assert.equal(
      canonicalizeTrendshiftUrl("https://trendshift.io"),
      "https://trendshift.io/?sort=views",
    );
  });

  it("preserves an explicit sort parameter", () => {
    assert.equal(
      canonicalizeTrendshiftUrl("https://trendshift.io/?sort=stars"),
      "https://trendshift.io/?sort=stars",
    );
  });

  it("canonicalizes subpaths (e.g. /monthly) onto the listing", () => {
    assert.equal(
      canonicalizeTrendshiftUrl("https://trendshift.io/monthly"),
      "https://trendshift.io/?sort=views",
    );
  });

  it("refuses /api paths (robots.txt law)", () => {
    assert.equal(
      canonicalizeTrendshiftUrl("https://trendshift.io/api/v1/x"),
      null,
    );
  });

  it("refuses other hosts", () => {
    assert.equal(
      canonicalizeTrendshiftUrl("https://evil.example/?sort=views"),
      null,
    );
    assert.equal(
      canonicalizeTrendshiftUrl("https://trendshift.io.evil.example/"),
      null,
    );
  });

  it("refuses malformed URLs", () => {
    assert.equal(canonicalizeTrendshiftUrl("not a url"), null);
    assert.equal(canonicalizeTrendshiftUrl(""), null);
  });
});
