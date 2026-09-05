import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseImpressions } from "../lib/fetchers/osp-impressions";

/**
 * parseImpressions tests (FID-2026-0905-004): the scraper's text contract —
 * "Impressions <count>" from tag-stripped page text (FID-2026-0904-008).
 */

describe("parseImpressions", () => {
  it("parses plain text", () => {
    assert.equal(parseImpressions("Impressions 41"), 41);
  });

  it("parses comma-grouped numbers", () => {
    assert.equal(parseImpressions("Impressions 12,345"), 12345);
  });

  it("finds the value inside real page markup", () => {
    const html = [
      "<html><head><style>body{}</style></head><body>",
      "<h1>Some Project</h1>",
      "<p>Impressions 7</p>",
      "<script>tracker(1)</script>",
      "</body></html>",
    ].join("");
    assert.equal(parseImpressions(html), 7);
  });

  it("is case-insensitive", () => {
    assert.equal(parseImpressions("impressions 99"), 99);
  });

  it("returns null when absent", () => {
    assert.equal(parseImpressions("<p>No count here</p>"), null);
  });

  it("returns null on non-numeric garbage", () => {
    assert.equal(parseImpressions("Impressions ???"), null);
  });
});
