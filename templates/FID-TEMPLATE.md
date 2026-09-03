# FID-{ID}

| Field        | Value |
| ------------ | ----- |
| **Filename** | `{FILENAME}` |
| **ID**       | {ID} |
| **Severity** | {SEVERITY: critical \| major \| minor} |
| **Status**   | {STATUS: created \| analyzed \| fixed \| verified \| converged \| closed} |
| **Created**  | {DATE} |
| **Author**   | {SCOPE-REFERENCE — per ECHO attribution rules, no agent names} |

## Summary

{One paragraph: what is broken/missing and why it matters.}

## Evidence (RED)

{Tool output, file:line references, grep results. Evidence must come from tool output, not belief.}

## Proposed Solution (GREEN)

{Design decisions with documented reasoning: approach, alternatives considered, why this wins.}

## Impact Analysis

{Files touched, schema changes, dependencies added, blast radius.}

## Verification Plan (AUDIT)

- Method 1 (static): {typecheck / lint / build commands}
- Method 2 (dynamic): {tests / runtime verification}
- Call-graph reachability: {grep patterns proving the feature is wired into production entry points}

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | | |

## Closure

{Implementation evidence required before `closed`: commit SHA or file:line ranges + grep match showing production callers. A `closed` FID with no code violates the Ground-Truth rule.}
