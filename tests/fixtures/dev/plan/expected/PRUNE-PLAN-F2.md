# PRUNE-PLAN-F2 — Command reference

> Batch F2 of `PRUNE-PLAN.md`. Spec: `workbench/prune/SPEC-prune.md`.

## Intent
The command reference and the memory page describe /memory prune. **Ids**: UC-01. **Depends on**: F1

## Design
| Point | Decision |
|-------|----------|
| Applied rules | — |
| Owning aggregate | none — the batch changes documentation only |
| Invariants | none — no rule is enforced by a page |
| Consistency | none — no state changes |
| Events | N/A — nothing is published |
| Access cost | none — no port is called |

## TDD sequence
Tests lead: a step's production code starts only once its tests exist and fail. Within the step, write the
passing path first, then the refusals, then the integration checks.
Pure declarations left without a test of their own (each one exercised by the test of its behaviour): none.

### Step 1 — The reference lists /memory prune with its options
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `the generated command table matches the command files` | unit | `tests` | UC-01 |

The English page and its French twin change together: the parity check reads both.

TDD: RED [ ] GREEN [ ] COST [ ]

### Step 2 — Build and tests
No test of its own: it runs the scopes of `## Test policy and scopes`.

## Test policy and scopes
**Fast suite**: `npm run check`, the generated docs and the docs parity included. **Integration**: none. **Not run**: none.

## Code elements

## Anchors
Paths copied by the implementation step; an existing one carries the line of the member it names, from the inventory of the plan run.

| Step | Test class / fixture | Shared doubles and builders | Production filled or created |
|------|----------------------|-----------------------------|------------------------------|
| 1 — The reference lists /memory prune with its options | — | — | `docs/commands.md` — existing; `docs/fr/commands.md` — existing |
| 2 — Build and tests | — | — | — |

## Assumptions
| # | Assumption | To be validated by |
|---|------------|--------------------|
