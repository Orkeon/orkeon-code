# blocked — Prune old memory entries

## 4. Use cases

### UC-01 — Prune old memory entries
- **Statement**: the user removes, in one command, the memory entries saved before a cut-off

## 5. Business rules

### BR-01 — An entry older than the cut-off is removed
- **Statement**: an entry whose saved date is before the cut-off leaves the store

## 12. Open questions

| # | Severity | Question | Impact | Options |
|---|----------|----------|--------|---------|
| 1 | Blocking | Which date counts, the saved one or the edited one? | the rule | saved / edited |
2 | Blocking | Is the cut-off a date or an age? | the command line | date / age
| 3 | **Blocking** | Are feedback entries kept? | the rule | yes / no |
| 5 | Major | Is the listing sorted by age? | the output | yes / no |

Severity | # | Question | Impact | Options
---|---|---|---|---
Blocking | 4 | Does a prune need a confirmation? | the command | yes / no
Major | 6 | Is the count printed? | the output | yes / no
