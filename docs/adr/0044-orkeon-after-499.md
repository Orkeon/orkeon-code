# ADR 0044: Orkeon main after #499, a shell read inside the mounts, a pruned conversation on Anthropic

- **Status**: accepted
- **Date**: 2026-11-28
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0043](0043-orkeon-after-496.md)

## Context

The pin moves from `f1fe709` to Orkeon `main` `f4778e0`, one merge later. **#499** answers the two issues opened
from this project after the previous pin:

- **#497, a `shell_command` read stays inside the mounts.** A `run` of a default read-only command is a read only
  when the tool can state where it reads. In a shell confined to the mounts it is: bubblewrap or Seatbelt, with no
  `Confinement:ReadOnlyPaths`, every mount and every sub path set apart granting reads, no agent root nor scope
  narrower than its mount. Otherwise, AppContainer included, every word of the command must resolve in a mount that
  grants reads: a `~`, an
  absolute host path, a climb out of the working directory's mount, an option that follows links (`grep -R`,
  `ls -L`), a walk over a folder where a sub path grants less than a read all make the call an execution. Every
  `git` call is an execution outside a shell confined to the mounts, whatever
  `Orkeon:Tools:Shell:AllowInterpreters` says; confined to them, an accepted `status`, `log`, `diff` or `show` on
  git 2.44 or later, its paths inside the mounts, is a read.
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
  thinking of every later message and makes the next call write its cache again from that result on. The results
  offered are those older than the last messages kept (6 by default), and the decision model picks among them: a
  pruning of an old result rewrites most of the conversation's cache. Whether it pays for itself was not measured.
- **The text for the model in `plan` says what a shell without confinement refuses.** It named the commands that
  run as reads and said git runs "where the host keeps git read-only", which the model cannot tell. It now says
  that every word that reads as a path lies inside the project (no `~`, no climb out, no option that follows
  links, a `grep` pattern that starts with `/` included), that git runs only in a confined shell and that a first
  refusal means it is not offered. In a shell confined to the mounts the rule on paths is stricter than the
  runtime: it costs a read the file tools make anyway.
- **[Permissions](../permissions.md) says what a shell read is held to**, where it said at the previous pin that
  nothing held it.

## Consequences

- With the example settings (no confinement), `plan` refuses every `git` call, and `default` and `acceptEdits` ask
  before one, as before #494. `grep -r` over a folder that holds a denied path, and a `grep` whose pattern reads as
  a path (`/api/`), ask too.
- A turn on Anthropic survives a pruning. The model loses its earlier reasoning at each one.
- The tool and docker modes still run `1.4.0`: no shell read in `plan`, and a pruning there can still end a turn on
  Anthropic on the thinking error.
- Neither answer was run live from this project when the pin moved.
