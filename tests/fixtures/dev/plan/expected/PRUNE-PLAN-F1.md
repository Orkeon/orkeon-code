# PRUNE-PLAN-F1 — Prune by age

> Batch F1 of `PRUNE-PLAN.md`. Spec: `workbench/prune/SPEC-prune.md`.

## Intent
/memory prune removes the entries older than a cut-off, keeps feedback, and can list without removing. **Ids**: BR-01, BR-02, BR-03 / UC-01. **Depends on**: [none]

## Design
| Point | Decision |
|-------|----------|
| Applied rules | DDD-01, DDD-02, DDD-03, DDD-08, DDD-09, DDD-10, DDD-11, APP-01, APP-04, APP-05, PERF-01 |
| Owning aggregate | `MemoryEntries`; the command only parses and prints |
| Invariants | BR-02; removes the category test the command would otherwise repeat |
| Consistency | one prune changes and saves the entry list once |
| Events | N/A — nothing is published |
| Access cost | 1 read + 1 write, whatever the number of entries |

## Decisions
- 2026-10-22 — The age is read from the entry's saved date; an entry without one is kept and counted apart.
- 2026-10-22 — review (Major): Does a prune with no cut-off refuse, or use a default age? Evidence: workbench/prune/SPEC-prune.md:31. Not settled by the plan run: answer it here before the first failing test of the step it concerns.

## TDD sequence
Tests lead: a step's production code starts only once its tests exist and fail. Within the step, write the
passing path first, then the refusals, then the integration checks.
Pure declarations left without a test of their own (each one exercised by the test of its behaviour): the prune usage line in src/commands/_lib/memory.ts.

### Step 1 — An entry older than the cut-off is removed
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `removes the entries saved before the cut-off` | unit | `src/shared/domain` | BR-01, UC-01 |
| 2 | `refuses a cut-off in the future` | unit | `src/shared/domain` | BR-01 |

TDD: RED [ ] GREEN [ ] COST [ ]

### Step 2 — Feedback entries survive a prune
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `keeps feedback entries older than the cut-off` | unit | `src/shared/domain` | BR-02 |

TDD: RED [ ] GREEN [ ] COST [ ]

### Step 3 — A dry run lists what would go and removes nothing
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `prune --dry-run prints the entries and writes nothing` | unit | `tests` | BR-03, UC-01 |

TDD: RED [ ] GREEN [ ] COST [ ]

### Step 4 — Build and tests
No test of its own: it runs the scopes of `## Test policy and scopes`.

## Test policy and scopes
**Fast suite**: `npm test`, every suite once. **Integration**: none — the memory store is doubled by FakeMemoryStore. **Not run**: the runtime smoke run — it needs a host.

## Code elements
**Domain**
- `pruneEntries(entries: MemoryEntry[], cutoff: Date): PruneResult` — removes what is older than the cut-off, never feedback
- `PruneResult` — the kept entries, the removed entries and the count of undated ones: what a prune would do, for the dry run
**Application**
- `runMemory(tokens: string[], deps: MemoryDeps): Promise<CommandView>` — gains the prune and --dry-run branch

## Anchors
Paths copied by the implementation step; an existing one carries the line of the member it names, from the inventory of the plan run.

| Step | Test class / fixture | Shared doubles and builders | Production filled or created |
|------|----------------------|-----------------------------|------------------------------|
| 1 — An entry older than the cut-off is removed | `src/shared/domain/memory-prune.test.ts` — to create | — | `src/shared/domain/memory-prune.ts` — to create |
| 2 — Feedback entries survive a prune | `src/shared/domain/memory-prune.test.ts` — to create | — | `src/shared/domain/memory-prune.ts` — to create; `src/shared/domain/memory.ts:18` — `MemoryEntry` |
| 3 — A dry run lists what would go and removes nothing | `tests/commands-memory.test.ts:12` — existing | `tests/support/fake-memory-store.ts:9` (`writes` to add) | `src/commands/_lib/memory.ts:40` — `runMemory` |
| 4 — Build and tests | — | — | — |

## Assumptions
| # | Assumption | To be validated by |
|---|------------|--------------------|
