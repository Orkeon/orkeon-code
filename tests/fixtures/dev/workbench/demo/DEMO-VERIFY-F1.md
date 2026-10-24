# DEMO-VERIFY-F1 — 2026-10-20 14:02 — fast

## Verdict — VALID

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Minor | Naming | A helper name says "parse" where it only splits cells | `plan-format.ts:40` | rename it when the file is next touched |

Validations: `npm test` — exit 0, whole suite, 812 tests
Not run: smoke runtime — no runtime in the container
