# ADR 0017: Orkeon main after #290, a styled split-pane console

- **Status**: accepted
- **Date**: 2026-11-06
- **Amends**: [ADR 0016](0016-orkeon-after-280.md)

## Context

The pin of ADR 0016 is `c101cbd`. Orkeon #290 (`3deabe1`, 2026-11-06, on `main`) gives the split-pane console a styled
transcript, a selection panel for `ctx.prompt` and for tool approvals, a menu of commands on `/`, the calls of each
step, file diffs, markdown, `context N%` and palettes. Orkeon Code writes plain text and gets most of this by running
on that commit.

## Decision

- **The pin moves to `3deabe1`** (`3deabe18b390923bd4936dd834970bd1d7c4c572`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides; the typings of the commands are
  regenerated from it with `scripts/sync-typings.sh`. `ctx.prompt` may now answer `null`, which a `select` left with
  Esc does on a console with panels.
- **No command changes here.** What Orkeon Code can adopt on top (a `Chooser` port and the selectors of `/model` and its
  siblings, `/diff`, `/theme`, markdown blocks for its results) comes in a change of its own.

## Consequences

- A tool approval opens a panel on Yes: Enter straight allows the call once, Esc denies. `/commit` and `/memory` pass
  `default: false` to `confirm`, so they still open on No.
- The main loop runs as a task, so its diffs and step calls show on that task's screen: the main screen shows the
  question, the reply and the summary line.
- The summary line of a turn counts the tools Orkeon Code's own code calls (`session_store`, `file_read`), as it did at
  `c101cbd`.
- Checks: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source` at `3deabe1`: 48 commands loaded, 0
  skipped, 0 conflicts. The main loop was run in the console against a fake model: the `/` menu, the approval panel,
  Enter writing the file, the diff on the task's screen. No real model was run.
