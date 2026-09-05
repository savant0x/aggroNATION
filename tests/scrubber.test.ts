import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectJunk, htmlToPlainText } from "../lib/quality/scrubber";

/**
 * Scrubber tests (FID-2026-0905-004). These patterns guard the corpus
 * against aggregator junk (FID-2026-0904-017/018); loosening a regex must
 * fail loudly here before it pollutes the index again.
 */

describe("htmlToPlainText", () => {
  it("strips tags and collapses whitespace", () => {
    assert.equal(htmlToPlainText("<p>Hello</p> <b>world</p>"), "Hello world");
  });

  it("removes script and style content entirely", () => {
    assert.equal(
      htmlToPlainText("<style>.x{}</style>Hi<script>evil()</script>"),
      "Hi",
    );
  });

  it("decodes the common entities", () => {
    assert.equal(
      htmlToPlainText(
        "A &amp; B &lt;tag&gt; &quot;q&quot; &#39;s&#39; &nbsp; ",
      ),
      "A & B <tag> \"q\" 's'",
    );
  });
});

describe("detectJunk", () => {
  it("flags the hnrss metadata template", () => {
    const body =
      "Article URL: https://example.com/a\nComments URL: https://news.ycombinator.com/item?id=1 Points: 12 # Comments: 3";
    assert.equal(detectJunk(body), "aggregator-metadata-template");
  });

  it("flags url dumps with almost no prose", () => {
    const body = "https://a.com https://b.com https://c.com t";
    assert.equal(detectJunk(body), "url-dump");
  });

  it("flags read-more and share stubs", () => {
    assert.equal(detectJunk("Read more"), "read-more-stub");
    assert.equal(detectJunk("Continue reading..."), "read-more-stub");
    assert.equal(detectJunk("Share this!"), "share-prompt-stub");
  });

  it("flags suspiciously short bodies", () => {
    assert.equal(detectJunk("<p>tiny</p>"), "suspiciously-short-body");
  });

  it("flags empty bodies (tags only)", () => {
    assert.equal(detectJunk("<div></div>"), "empty-body");
  });

  it("passes real prose through as null", () => {
    const body =
      "This release adds support for streaming responses with backpressure handling. ".repeat(
        2,
      );
    assert.equal(detectJunk(body), null);
  });
});
