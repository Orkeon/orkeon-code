# VDEMO-PLAN-F1 — Withdrawals

> Batch F1 of `VDEMO-PLAN.md`.

## Intent
An account pays out what its balance holds and refuses a larger amount with an overdraft error.

| Applied rules | DDD-01, DDD-02, APP-01 |
|---|---|

## TDD sequence

### Step 1 — Withdraw within the balance, refuse beyond it (BR-02, BR-03)
| # | Test | Level | Project | Ids |
|---|------|-------|---------|-----|
| 1 | `AccountTests.ShouldWithdraw_WhenBalanceSuffices` | unit | `tests/Ledger.Tests` | BR-02 |
| 2 | `ShouldRefuseWithdrawal_WhenBalanceIsShort` | unit | `tests/Ledger.Tests` | BR-03 |

TDD: RED [x] GREEN [x] COST [x]

## Decisions
The overdraft is its own exception type, so a caller can tell it from a bad amount.
