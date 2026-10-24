# DEMO-VERIFY-F2 — 2026-10-21 09:10 — fast

## Verdict — GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Blocking | Test | The refusal of `a/b` is never exercised | `tests/commands-dev.test.ts` has no such case | add the case and see it fail first |
| Major | Scope | The table shows `open | done` for one batch | `dev.ts:88` | print the state the plan line holds |

Validations: `npm test` — exit 1, whole suite, 811 tests
Not run: smoke runtime — no runtime in the container

# DEMO-VERIFY-F2 — 2026-10-21 09:40 — resume

## Verdict — GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Major | Scope | The state column still merges two states | `dev.ts:91` | print the state the plan line holds |

Validations: `npm test` — exit 0, whole suite, 812 tests
Measure: duration 00:34, turns 41, subagents 3
