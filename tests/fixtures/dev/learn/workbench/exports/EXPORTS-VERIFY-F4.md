# EXPORTS-VERIFY-F4 — 2026-10-17 11:30 — fast

## Verdict — GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Major | Test | la règle « refus » n'est jamais testée — export CSV | `tests/exports.test.ts:12` | ajouter le cas du refus et le voir échouer |

Validations: `npm test` — exit 0, whole suite, 98 tests

# EXPORTS-VERIFY-F4 — 2026-10-17 12:10 — resume

## Verdict — VALID

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Major | Scope | a column was added that the plan does not name | `src/exports/csv.ts:40` | name the column in the plan |

Validations: `npm test` — exit 0, whole suite, 99 tests
