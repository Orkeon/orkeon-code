# ADR 0005: Orkeon main after #206, on the rc.6 pin

- **Status**: accepted
- **Date**: 2026-10-26
- **Amends**: [ADR 0004](0004-orkeon-after-180.md)

## Context

Orkeon #206 is merged on Orkeon `main` (`7efa3b60`); no tag holds it yet. It closes the five issues Orkeon Code had
opened against the runtime (Orkeon #196 to #200) and changes the surface Orkeon Code runs on:

- **Relative paths** (#199, #200). A file tool (`file_read`, `file_write`, `edit_file`, `glob`, `grep`, the node
  readers and editors, `edit_batch`, the search tools) resolves a relative `path` against the agent's root, else the
  file system's working directory (`/workspace` when mounted), and answers with the absolute path. An empty `path` is
  refused with `path is required: …`; a path in no mount says `a path starts with a mount: /workspace/…`.
  `shell_command` without `working_directory` runs in the agent's root, else that working directory: it no longer
  falls back to the first mount that grants the right.
- **Pending approvals for scripts** (#198). A `*.cmd.ts` reads the tool approvals waiting for the operator through
  `ctx.services.get("approvals")`: `list()` gives `{ taskId, command, tool, input }` per approval, an empty list once
  answered. The typings declare `PendingApprovals` and `PendingApproval`.
- **The TUI** (#196) no longer rebuilds a pane for each appended line, and **`--llm-log`** (#197) keeps the cache,
  reasoning and cost counts of a streamed exchange. Neither changes what Orkeon Code calls.
- **`orkeon-repl --replay <file>`** feeds a file of REPL lines as if typed, non-interactive by default, with exit codes
  `0`, `1` (stopped at a line) and `2` (file missing); the file is read through the VFS, so it sits under a mount.

## Decision

- **The same pin.** `.orkeon-version` stays `1.0.0-rc.6`; the surface Orkeon Code targets is Orkeon `main` after
  #206, the one that tag will carry. The runtime smoke builds from that commit (`ORKEON_SOURCE_REF`).
- **Typings from the sources until the tag**, as ADR 0002 and ADR 0004 decided (`scripts/sync-typings.sh` over
  `ORKEON_SOURCE`).
- **`/tasks` reads the approvals.** A `PendingApprovals` port (`ports/approvals.ts`), its adapter over the
  `approvals` service, which answers an empty list on a host that does not register it; `/tasks` lists each approval
  waiting with its ticket, its command and its tool. This closes Orkeon Code's #15 as it was meant.
- **The relative-path resolution of the tool-call hook stays** (`shared/domain/dev/path-args.ts`): the runtime now
  resolves a relative path too, but Orkeon Code's own guard and hooks judge the path before the call, and they must
  see one absolute form. The reading rule of the dev roles no longer forbids a relative path: it says where such a
  path is read, and that either form goes.
- **Nothing to configure.** `/workspace` is mounted `rw` by the launcher and no settings file sets
  `Orkeon:FileSystem:WorkingDirectory`, so the end of `shell_command`'s fallback changes nothing for Orkeon Code.

## Consequences

- `scripts/smoke-runtime.sh` keeps feeding `/exit` through the standard input: `--replay` would give it exit codes
  of its own, once the replay file is written under a mount the `--demo` mode creates (`/tmp`). A possible follow-up.
- `/tasks` shows a task blocked on the operator as such, under the list, where only its "running" row showed
  before.
- A relative path no longer meets the `No mount found for virtual path` text; the runtime keeps it, with a hint,
  for a path in no mount. The comments that cited it say what the resolution is for now.

## Alternatives considered

- **Drop the hook's path resolution now that the runtime resolves**: the guard would then match a relative path in
  a form the rules do not name, and a hook would receive a path the runtime has not yet resolved.
- **Wait for the tag**: the `/tasks` gap (#15) and the cost of the old refusals in live runs are worth closing first.
