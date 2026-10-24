# DEMO-PLAN — Demo feature

> Built from `workbench/demo/SPEC-demo.md`. Sheets: `DEMO-PLAN-F1.md`, `DEMO-PLAN-F2.md`, `DEMO-PLAN-F3.md`.

## 0. Summary

| Batch | Intent | Ids | Depends on | Reason |
|-------|--------|-----|------------|--------|
| F1 | Read the plan, sheet and verdict files into typed records | artefacts, plan-format | — | everything else reads through them |
| F2 | Show the progress of one work item in a single command | dev-status | F1 | the command prints what the parsers return |
| F3 | Describe the command in both documentation languages | docs | — | can be written at any time |

### Batch F1 — Parsers — done (2026-10-20)
- [x] 1. Recognise each artefact by its file name
- [x] 2. Turn a plan and its sheets into batches and ticks
- [x] 3. Build and tests — scope: the domain suites

### Batch F2 — Command — open
- [x] 1. Print the batches of a plan with their state
- [ ] 2. Refuse a code that is not a plain folder name
- [ ] 3. Build and tests — scope: the whole suite

### Batch F3 — Docs — open
- [ ] 1. Add the command page in English and French
- [ ] 2. Build and tests — scope: the parity check

## 1. Scope

- **Layers**: domain parsers and one read-only command
- **Out of scope**: any write to the work folder
