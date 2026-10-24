# prune — Prune old memory entries

## 1. Context

Typed memory grows with every session: old project and reference entries crowd the listing, while feedback entries keep their value however old they are. The user wants one command that removes what is stale and can show first what it would remove.

## 4. Use cases

### UC-01 — Prune old memory entries
- **Statement**: the user removes, in one command, the memory entries saved before a cut-off · **Actor**: the user

## 5. Business rules

### BR-01 — An entry older than the cut-off is removed
- **Statement**: an entry whose saved date is before the cut-off leaves the store · **Origin**: the request

### BR-02 — A feedback entry is never removed by a prune
- **Statement**: a feedback entry stays whatever its age · **Origin**: the memory page

### BR-03 — A dry run removes nothing
- **Statement**: with --dry-run the command lists the entries it would remove and writes nothing · **Origin**: the request

## 11. Out of scope

Pruning by any category other than feedback.

## 12. Open questions

| # | Severity | Question | Impact | Options |
|---|----------|----------|--------|---------|
| 1 | Major | Does a prune with no cut-off refuse, or use a default age? | the command line | refuse / 90 days |
