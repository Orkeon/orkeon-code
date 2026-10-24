# VDEMO-PLAN — Withdrawals on a ledger account

> A tiny ledger used to check the gate of the dev workflow.

## 0. Summary

| Batch | Goal | Ids | Depends on | Why this order |
|---|---|---|---|---|
| F1 | Let an account give money back, never below zero | BR-02, BR-03 | — | deposits (BR-01) already exist |

### Batch F1 — Withdrawals — open
An account can withdraw what its balance holds and refuses the rest.

## 1. Scope

**Non-applicable rules**: DDD-03: N/A — no aggregate boundary moves; DDD-04: N/A — no value object is added; DDD-05: N/A — no domain event; DDD-06: N/A — no repository; DDD-07: N/A — no factory; DDD-08: N/A — no domain service; DDD-09: N/A — no invariant spans two aggregates; DDD-10: N/A — no identity changes; DDD-11: N/A — no module is split; APP-02: N/A — no transaction; APP-03: N/A — no port is added; APP-04: N/A — no input mapping; APP-05: N/A — no authorisation; PERF-01: N/A — no loop over stored data
