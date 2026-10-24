# OLD-VERIFY-F1 — 2026-09-30 08:00 — fast

## Verdict — GAPS

| Severity | Axis | Gap | Evidence | Expected fix |
|----------|------|-----|----------|--------------|
| Major | Scope | an archived batch touched a file outside its plan | `src/old/report.ts:3` | revert the stray file |
