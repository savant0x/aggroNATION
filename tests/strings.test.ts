import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stripLoneSurrogates, truncateSafe } from "../lib/strings";

/**
 * String tests (FID-2026-0905-004). These helpers exist because of a real
 * production bug (unpaired surrogates rejecting jsonb writes — FID-002);
 * the tests pin the exact UTF-16 semantics so they can never regress.
 */

// 😀 = U+1F600, UTF-16: high 0xD83D + low 0xDE00.
const EMOJI = "\u{1F600}";

describe("stripLoneSurrogates", () => {
  it("keeps valid text unchanged", () => {
    assert.equal(stripLoneSurrogates("hello world 123"), "hello world 123");
  });

  it("keeps complete surrogate pairs", () => {
    assert.equal(stripLoneSurrogates(`a${EMOJI}b`), `a${EMOJI}b`);
  });

  it("drops a lone high surrogate", () => {
    assert.equal(stripLoneSurrogates("a\uD83Db"), "ab");
  });

  it("drops a lone low surrogate", () => {
    assert.equal(stripLoneSurrogates("a\uDE00b"), "ab");
  });

  it("drops a high surrogate at end of string", () => {
    assert.equal(stripLoneSurrogates("ab\uD83D"), "ab");
  });

  it("drops two adjacent high surrogates (both unpaired)", () => {
    // Two HIGH surrogates in a row: the first's next is high (not low) so it
    // is lone; the second has no next at all. Both are dropped.
    assert.equal(stripLoneSurrogates("\uD83D\uD83D"), "");
  });
});

describe("truncateSafe", () => {
  it("returns input unchanged when under the limit", () => {
    assert.equal(truncateSafe("hello", 10), "hello");
    assert.equal(truncateSafe("hello", 5), "hello");
  });

  it("truncates to the limit on plain ASCII", () => {
    assert.equal(truncateSafe("abcdefgh", 4), "abcd");
  });

  it("returns empty for non-positive limits", () => {
    assert.equal(truncateSafe("abc", 0), "");
    assert.equal(truncateSafe("abc", -1), "");
  });

  it("backs off one unit rather than splitting a surrogate pair", () => {
    // "ab" + emoji = 4 code units. Cutting at 3 would split the pair.
    const s = `ab${EMOJI}`;
    const out = truncateSafe(s, 3);
    assert.equal(out, "ab");
  });

  it("keeps the emoji when the cut lands after the pair", () => {
    const s = `ab${EMOJI}cd`;
    assert.equal(truncateSafe(s, 4), `ab${EMOJI}`);
    assert.equal(truncateSafe(s, 5), `ab${EMOJI}c`);
  });
});
