# DEMO-PLAN-F2 — Command

> Batch F2 of `DEMO-PLAN.md`.

## Intent
Give one line per batch of a work item. **Ids**: dev-status. **Depends on**: F1

## TDD sequence

### Step 1 — Print the batches of a plan with their state
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `lists each batch with its ticks` | unit | `tests` | dev-status |

TDD: RED [x] GREEN [ ] COST [ ]

### Step 2 — Refuse a code that is not a plain folder name
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `refuses a code that climbs out of the folder` | unit | `tests` | dev-status |

TDD: RED [ ] GREEN [ ] COST [ ]

### Step 3 — Build and tests
No new test here.

## Test policy and scopes
**Fast suite**: `npm test`, whole suite.
