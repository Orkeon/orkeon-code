# ADR 0018: Orkeon main after #291, the main loop on the main screen

- **Status**: accepted
- **Date**: 2026-11-06
- **Amends**: [ADR 0017](0017-orkeon-after-290.md)

## Context

The pin of ADR 0017 is `3deabe1`. There the main loop runs as a task, so its diffs and step calls show only on that
task's screen. Orkeon #291 (`839818d`, 2026-11-06, on `main`) removes an ended task from the list unless its screen is
being read, which would make those diffs unreadable once the turn ends. The same change adds the launch option
`{ onMain: true }`, which makes a crew the conversation of the console's main screen.

## Decision

- **The pin moves to `839818d`** (`839818d6aedefd96954bc470d4cefa6541aec1ba`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides; the typings of the commands are
  regenerated from it with `scripts/sync-typings.sh`.
- **`launchMainLoop` launches with `onMain: true`.** Every command that goes through it writes on `main`: `/assistant`,
  `/verify`, `/summary`, `/voice` and `/transcribe --then`. Commands launched as crews of their own, such as `/analyze`,
  stay tasks.

## Consequences

- This replaces the consequence of ADR 0017 about the main loop's screen. Its text, calls, diffs and approvals land on
  `main`, with no row in the list, so `main` shows only beside another running task. Its approvals name no task.
- The summary line of ADR 0017 is gone once the console draws each call, so the calls Orkeon Code's own code makes
  (`session_store`, `file_read`) are no longer counted on screen.
- `Esc Esc` leaves only the console's `Interrupted` notice: no end line, and `completed` does not run. A failure or a
  token that expired on its own still writes its end line and the `✗ <label> failed` line.
- A second launch through `launchMainLoop` while one runs, such as `/verify` during a prompt, is an ordinary task beside
  it. A second prompt during a turn is still refused by `maxConcurrent: 1` on `/assistant`.
- A `progress_report` from the main loop shows only in `ps` and `inspect`, since it has no row.
- Checks: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source` at `839818d`: 48 commands loaded, 0
  skipped, 0 conflicts. The main loop was run in the console at that commit against a fake model: streamed text, the
  approval, the diff, the folded step and a markdown table all on `main`. No real model was run.
