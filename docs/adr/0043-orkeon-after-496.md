# ADR 0043: Orkeon main after #496, the conversation cached, a cut shell output read from its fields

- **Status**: accepted
- **Date**: 2026-11-28
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0041](0041-orkeon-after-488.md)

## Context

The pin moves from `9ca8530` to Orkeon `main` `f1fe709`, two merges later:

- **#489** lists a held question only once the run clock is stopped. Nothing of this project reads that list.
- **#496** answers six issues opened from this project, after a turn in `plan` mode on a folder of several
  repositories spent 1.15 million tokens in 21 calls and ended on its budget:
  - **#490, the conversation of a tool loop is cached on Anthropic.** A request that marks its system prompt or its
    tools cacheable gets a breakpoint on the last block of its conversation too, once the messages hold an assistant
    turn: each call of a tool loop reads what the previous one wrote. `LlmCacheOptions` gains `conversation`
    (`true` marks every call, `false` keeps the stable prefix alone; left out, it follows the two others).
  - **#495, the context budget counts a partly cached prompt once.** `contextTokens` charges a call its completion
    plus the lesser of what its prompt grew by and the part the cache did not serve. A cache that served the system
    prompt and the tools alone made each call of a loop pay its whole conversation again.
  - **#494, a read-only `shell_command` run is a read.** The tool declares a `run` of one of its default read-only
    commands (`ls`, `cat`, `pwd`, `which`, `grep`, `wc`, `echo`, `dir`, `type`, `where`, and `git` limited to
    `status`, `log`, `diff`, `show`) as a read to the permission gate, and everything else (a job action, an extra
    or custom command, an interpreter) as an execution. `git` is an execution too once
    `Orkeon:Tools:Shell:AllowInterpreters` is on, which every example settings file of this project sets, and with a
    git older than 2.44. The gate lets a read through without asking in every mode; its refusal in `plan` names
    what the mode lets through.
  - **#492, a cut `shell_command` output says so.** Each stream keeps its head and its tail around a marker that
    counts what was left out; the result carries `stdout_truncated`, `stderr_truncated`, the true lengths, and
    `output_path`, a file that holds the whole output.
  - **#493, `completed` knows its launch.** `completed(result, ctx)` receives `result.ticket` and `result.state`,
    the JSON value the launch attached (`runCrewAsync(name, input, { state })`, `commands.post(..., { state })`).
  - **#491, a typed `!` line runs a shell command of the operator's own** in the REPL, without a turn of the
    model, its output left in the session as a note. It runs only for a line typed at a terminal.

The last release is still `1.4.0`, nine commits behind the pin.

## Decision

- **The cache request stays as it is.** Every agent asks `{ systemPrompt: true, tools: true }`
  (`shared/infrastructure/orkeon/llm-profile.ts`); the conversation follows. Asking `conversation: true` would also
  write the conversation of a single call that nothing reads back.
- **The budget of the main loop stays at 700k context tokens.** The figure was sized for a context counted once
  ([turn-budget.ts](../../src/crews/main-loop/domain/turn-budget.ts)); the runtime's count meets that reading on
  Anthropic as elsewhere.
- **The read-only modes keep their catalogue.** `plan` and `dontAsk` offer no `shell_command` in this change. The
  tool checks the paths of a command only where an argument names a mount: without confinement
  (`Orkeon:Tools:Shell:Confinement:Mode` at `None`, the example settings' value), a read-only command reads any
  file the user's account can read, where the file tools are held to the mounts. Offering the tool to `plan` is a
  change of its own, with that reach stated.
- **A cut output is known from the result's fields.** The `Shell` port says when the runtime cut a stream and its
  true length, read from `stdout_truncated` and `stdout_total_chars`. The gate and the capture of `/dev-verify`,
  which the audit of `/dev-batches` runs, read that: the marker sits in the middle of the text, where a diff that
  quotes it cannot be told from a cut one.
- **The launch state and the `!` line are not used by a source of `main`.** They serve work that is not merged: the
  approval of a plan reads the launch state; `/sh` overlaps the `!` line.

## Consequences

- A tool loop on Anthropic pays its conversation at the cache-read rate from its second call, and its context
  budget charges about the context plus the completions. Neither was measured again on the turn that showed the
  defect.
- In `default` and `acceptEdits` a `shell_command` run of a read-only command no longer waits for the user's answer:
  `ls`, `cat`, `grep` and the others run as the file reads do. Without confinement that covers a path outside the
  project. The operator's answer was the guard on these paths at the previous pin; it is raised with the runtime.
- The tool and docker modes still run `1.4.0`, where every `shell_command` call is an execution and a cut output
  ends on its notice: there the gate asks as before, and a cut output of a gate command is read as whole.
