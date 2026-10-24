# DEMO-PLAN-F1 — Parsers — done (2026-10-20)

> Batch F1 of `DEMO-PLAN.md`.

## Intent
Read every format line the workflow leaves behind. **Ids**: artefacts, plan-format. **Depends on**: [none]

## TDD sequence

### Step 1 — Recognise each artefact by its file name
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `classifies a batch sheet before a plan` | unit | `src` | artefacts |

TDD: RED [x] GREEN [x] COST [x]

### Step 2 — Turn a plan and its sheets into batches and ticks
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `reads the state of every batch` | unit | `src` | plan-format |

TDD: RED [x] GREEN [x] COST [x]

### Step 3 — Build and tests
No new test here.

Done (2026-10-20) — npm test — exit 0, whole suite

## Test policy and scopes
**Fast suite**: `npm test`, whole suite.
