# LEDGER-VERIFY-F1 — 2026-10-12 10:15 — fast

## Verdict — GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Major | Test | the refusal of a negative amount has no test | `src/ledger/withdraw.ts:14` | add a case that withdraws -5 and expects the refusal |
| Minor | Simplification | two branches compute the same balance | `src/ledger/balance.ts:30` | keep one branch |
| Major | Placement | the rounding helper sits in the command | `src/commands/ledger.cmd.ts:52` | move it to the ledger domain |
|  Major  |  test  |   the fee  of a transfer is never checked against zero   |  `tests/ledger.test.ts:70`  |  add a zero-fee case  |
| Blocking | PLACEMENT | the currency table is loaded by the shell adapter | `src/ledger/shell.ts:12` | load it from the ledger domain |
| Major | Test | a row cut short, with four cells and no fix | `tests/ledger.test.ts:90` |
| Major | Placement | the overdraft  threshold lives in the CLI flags | `src/commands/ledger.cmd.ts:20` | keep the threshold in the ledger domain

Validations: `npm test` — exit 0, whole suite, 204 tests
