# PRUNE-PLAN — Prune old memory entries

> From `workbench/prune/SPEC-prune.md`. Sheets: `PRUNE-PLAN-F1.md`, `PRUNE-PLAN-F2.md`.

## 0. Summary

| Batch | Intent | Ids | Depends on | Reason |
|-------|--------|-----|------------|--------|
| F1 | /memory prune removes the entries older than a cut-off, keeps feedback, and can list without removing | BR-01, BR-02, BR-03 / UC-01 | — | foundation: the rule and the command in one deliverable |
| F2 | The command reference and the memory page describe /memory prune | UC-01 | F1 | documents the behaviour F1 delivers |

### Batch F1 — Prune by age — open
- [ ] 1. An entry older than the cut-off is removed
- [ ] 2. Feedback entries survive a prune
- [ ] 3. A dry run lists what would go and removes nothing
- [ ] 4. Build and tests — scope: npm test (whole suite), then the memory tests alone in later rounds

### Batch F2 — Command reference — open
- [ ] 1. The reference lists /memory prune with its options
- [ ] 2. Build and tests — scope: npm run check (generated docs and docs parity)

## 1. Scope

- **Spec**: `workbench/prune/SPEC-prune.md`
- **Layers**: src/shared/domain, src/commands/_lib, docs
- **Reuse**: `src/shared/domain/memory.ts:18` (MemoryEntry); `src/commands/_lib/memory.ts:40` (runMemory)
- **Out of scope**: pruning by category other than feedback (a later spec)
- **Assumptions**: none
- **Commands**: restore `npm ci` · build `npm run build` · build_test (not in the pack) · test_class `node --test <Class>` · test `npm test` · test_project (not in the pack) · test_integration (not in the pack) — from `.orkeon/repo.yaml`
- **Layout**: domain `src/shared/domain` · application `src/shared/application` · infrastructure `src/shared/infrastructure` · tests `tests` — from `.orkeon/repo.yaml`
- **Non-applicable rules**: DDD-04: N/A — the cut-off is a date with no rule of its own; DDD-05: N/A — no entry designates another; DDD-06: N/A — no entry is created or restored; DDD-07: N/A — nothing is published as an event; APP-02: N/A — the existing memory store port is reused; APP-03: N/A — the store's removal is reused and its persistence is unchanged

## 2. Traceability

| Id | Code owner(s) | Batch |
|----|---------------|-------|
| UC-01 — Prune old memory entries | `runMemory()` + `pruneEntries()` | F1, F2 |
| BR-01 — An entry older than the cut-off is removed | `pruneEntries()` | F1 |
| BR-02 — A feedback entry is never removed by a prune | `pruneEntries()` | F1 |
| BR-03 — A dry run removes nothing | `runMemory()` | F1 |

## 3. Design

| Ids | Owning aggregate | Invariant and what it removes | Consistency | Batch |
|-----|------------------|-------------------------------|-------------|-------|
| BR-01, BR-02 | `MemoryEntries` | feedback is filtered by the owner, so the command never tests a category | one call removes and saves the entries once | F1 |
