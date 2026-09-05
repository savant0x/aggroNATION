# FID-2026-0904-016

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0904-016-hero-live-signal.md` |
| **ID**       | FID-2026-0904-016 |
| **Severity** | minor |
| **Status**   | closed |
| **Created**  | 2026-09-04 |
| **Author**   | Operator request: live-signal overlay on the hero banner (item count, last update, pipelines) |

## Summary

Ledger backfill: the hero live-signal strip shipped in commit `ce0b304`
without a FID file (executed directly during a same-day session). Recorded
here so the ledger stays complete. Scope: server-rendered item count, last
fetch-cycle recency, and live pipeline count in a translucent pill at the
banner's lower edge, matching the navbar design language; shared
`relativeTime` util extracted to `lib/format/relative-time.ts`; honest
failure line when the signal query fails; ISR behavior unchanged
(verified HIT + s-maxage=60). Evidence: commit `ce0b304`, production probes
("strip live: True", count 908).

## Closure

`closed` — implemented, deployed, production-verified 2026-09-04.
