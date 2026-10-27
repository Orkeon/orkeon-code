# ADR 0006: Orkeon main after #213, on the rc.6 pin

- **Status**: accepted
- **Date**: 2026-10-26
- **Amends**: [ADR 0005](0005-orkeon-after-206.md)

## Context

Orkeon #213 is merged on Orkeon `main` (`947d3215`); no tag holds it yet. It closes the three issues the live runs
of 2026-10-26 opened against the runtime of ADR 0005 (Orkeon #210 to #212) and changes the surface Orkeon Code runs
on:

- **The interactive REPL starts on a terminal** (#212). On the `main` after #206 the REPL hung after its start lines
  when its standard input was a terminal, TUI and `--ui plain` alike: a cycle in the REPL's services, the replay
  command taking the console being built. Only `--replay` and a redirected input went on. The replay console is now
  resolved lazily, at the command's first execution.
- **Concurrent streaming keeps whole lines** (#211). The console sink streams the foreground act as it arrives, as
  before; every other turn holds its own line buffer and writes one whole line at a time under one lock. A turn under
  a command instance (a background command, a `runAgent` sub-run) prefixes its lines with the ticket, `[t2] `, as the
  completion lines are; a crew task adds its id. The API gains `ILlmDeltaSink.BeginTurn(label)`, a default member
  the recording sinks need not implement. *Note of 2026-10-27*: Orkeon #217 gives the split-pane REPL one screen
  per thread, and a task's lines go to its own screen without the ticket prefix; the plain console keeps the
  prefix described here.
- **The structural tools publish their parameter schema** (#210). `node_outline`, `node_read`, `node_replace`,
  `node_insert`, `node_ensure` and `edit_batch` sent `{"type":"object","properties":{}}` to the model, which learnt
  the arguments from the description alone and guessed `node_outline` without a `path` and `edit_batch` without
  `operations`. The schema generator now reads their request records; the generated typings type each input, the
  required members as such and the `kind`, `op`, `position` and `validate` values as literals.

## Decision

- **The same pin.** `.orkeon-version` stays `1.0.0-rc.6`; the surface Orkeon Code targets is Orkeon `main` after
  #213, the one that tag will carry. The runtime smoke builds from that commit (`ORKEON_SOURCE_REF`).
- **Typings from the sources until the tag**, as ADR 0002, 0004 and 0005 decided (`scripts/sync-typings.sh` over
  `ORKEON_SOURCE`). The typings of the node tools and `edit_batch` are the generated ones; nothing in Orkeon Code
  calls them from a script, so the type check sees no change.
- **The editing rule keeps spelling the `edit_batch` shape out.** The schema now says it to the model, but the guard
  that refuses a batch without `operations` repeats the same words as the rule, and a role that reads the refusal
  must find the shape it was told. The shape's words are unchanged; the rule's comment says why they stay. The rule
  itself gained one sentence after the live run of 2026-10-27 on this runtime: each `node_replace` of a batch carries
  the hash `node_read` gave for that very node, since a placeholder hash made the runtime refuse a whole batch.
- **Console streaming stays on in the example settings.** The interleaving the known issues told the user to avoid
  by disabling the streaming for a `/dev-batches --concurrency` run is gone; what remains known is an answer printed
  twice, and the advice to disable the streaming for an unattended run.
- **Nothing to configure.** The REPL start, the sink and the schema change no key.

## Consequences

- The known issues of the roadmap lose the REPL hang and the interleaving; the configuration page says how a
  concurrent run streams now.
- A `/dev-implement` or `/dev-batches` role gets a typed `edit_batch` and `node_*` call from the model's side: fewer
  refusals of a batch without `operations` or an outline without a `path`, and fewer retries charged to the batch's
  budget.
- The source mode on a terminal was checked by hand on a pseudo-terminal of 120x40 that answers the terminal's
  queries: with `--ui plain` the start reaches `Scripted commands ready: 58 loaded` and the `scripted>` prompt in
  seven seconds, and `/exit` ends it; the TUI draws its interface in five seconds (128 KB, the REPL banner and its
  help, where the runtime of ADR 0005 wrote 244 bytes of queries and nothing more), and `/exit` ends it too.

## Alternatives considered

- **Drop the spelt-out `edit_batch` shape now that the schema is published**: the guard's refusal would then name a
  shape the rule never stated, and the rule is cheaper than a refused call.
- **Wait for the tag**: a REPL that does not start on a terminal is not a runtime to pin.
