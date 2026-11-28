# ADR 0044: Orkeon main after #499, a shell read inside the mounts, a pruned conversation on Anthropic

- **Status**: accepted
- **Date**: 2026-11-28
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0043](0043-orkeon-after-496.md)

## Context

The pin moves from `f1fe709` to Orkeon `main` `f4778e0`, one merge later. **#499** answers the two issues opened
from this project after the previous pin:

- **#497, a `shell_command` read stays inside the mounts.** A `run` of a default read-only command is a read only
  when the tool can state where it reads. In a confined shell whose view grants what the mounts grant, it is. In a
  shell without confinement, every word of the command must resolve in a mount that grants reads: a `~`, an
  absolute host path, a climb out of the working directory's mount, an option that follows links (`grep -R`,
  `ls -L`), a walk over a folder where a sub path grants less than a read all make the call an execution. Every
  `git` call is an execution without confinement, whatever `Orkeon:Tools:Shell:AllowInterpreters` says; confined, an
  accepted `status`, `log`, `diff` or `show` on git 2.44 or later is a read.
- **#498, a rewritten conversation no longer fails Anthropic's thinking check.** A thinking block's signature binds
  it to everything before it. The runtime rewrote earlier messages (the pruning of tool results, the compaction, a
  history trim) and still sent the later thinking back: on a model with preserved thinking the next call could fail
  with "The block is bound to a different conversation". A turn of the main loop on `claude-opus-5-5` with
  `compaction.prune` on ended that way twice, after 32 model calls. The runtime now drops the thinking from the
  rewritten message on, and resends once without any thinking when the API still answers that error.

The last release is still `1.4.0`, ten commits behind the pin.

## Decision

- **Nothing of the request changes.** The pruning is still asked with `act({ prune: true })` when `compaction.prune`
  is on; the fix is the runtime's.
- **`compaction.prune` stays off by default, and its cost on Anthropic is documented.** A pruned result drops the
  thinking of every later message and makes the next call write its cache again from that result on. The oldest
  results are pruned first, so a pruning there rewrites most of the conversation's cache. Whether it pays for
  itself was not measured.
- **The text for the model in `plan` stays as it is.** It names the commands that run as reads, promises no git and
  tells the model never to retry a refusal and to read, list and search with the file tools. A read the runtime
  now refuses there (a path outside the mounts, a recursive walk beside a denied path) meets that rule.
- **[Permissions](../permissions.md) says what a shell read is held to**, where it said at the previous pin that
  nothing held it.

## Consequences

- With the example settings (no confinement), `plan` refuses every `git` call, and `default` and `acceptEdits` ask
  before one, as before #494. `grep -r` over a folder that holds a denied path, and a `grep` whose pattern reads as
  a path (`/api/`), ask too.
- A turn on Anthropic survives a pruning. The model loses its earlier reasoning at each one.
- The tool and docker modes still run `1.4.0`: no shell read in `plan`, and no pruning.
- Neither answer was run live from this project when the pin moved.
