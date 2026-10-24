# INVOICES-VERIFY-F2 — 2026-10-15 09:05 — fast

## Verdict — GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
Major | Test | the refusal text for an unknown currency is never asserted | `tests/invoices.test.ts:88` | assert the exact refusal text
| Major | Conventions | the status field mixes `open|closed` in one string | `src/invoices/status.ts:9` | give each status its own literal |
| Major | Placement | an amount is rounded inside the controller | `src/invoices/controller.ts:61` | round in the invoice domain |

Validations: `npm test` — exit 1, whole suite, 156 tests
Not run: smoke runtime — no runtime in the container
