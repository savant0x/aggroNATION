/**
 * Unicode-safe string helpers.
 *
 * Context (upsertContentBatch "invalid input syntax for type json"): excerpt
 * truncation via String.slice can split a UTF-16 surrogate pair — e.g. an
 * emoji landing exactly on the 280th code unit. The dangling half-surrogate
 * serializes as an unpaired \uD800-\uDFFF escape in JSON, which PostgreSQL's
 * jsonb parser rejects ("invalid input syntax for type json"). JS strings are
 * UTF-16 code units, NOT code points — slice/charAt operate on units.
 */

/**
 * Drop any surrogate code unit that is not part of a complete pair. A safety
 * net for external data that arrives already broken (feeds, scraped HTML,
 * APIs emitting unpaired escapes) — valid text passes through unchanged.
 */
export function stripLoneSurrogates(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      }
      // else: lone high surrogate — dropped
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // lone low surrogate — dropped
    } else {
      out += input[i];
    }
  }
  return out;
}

/**
 * Truncate to at most `max` code units without splitting a surrogate pair:
 * if the cut would land between the halves of a pair, it backs off one unit.
 * Combine with stripLoneSurrogates when the input is untrusted.
 */
export function truncateSafe(input: string, max: number): string {
  if (max < 0) return "";
  if (input.length <= max) return input;
  const cut =
    max > 0 &&
    input.charCodeAt(max - 1) >= 0xd800 &&
    input.charCodeAt(max - 1) <= 0xdbff
      ? max - 1
      : max;
  return input.slice(0, cut);
}
