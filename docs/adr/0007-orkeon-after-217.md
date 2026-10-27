# ADR 0007: Orkeon main after #217, on the rc.6 pin

- **Status**: accepted
- **Date**: 2026-10-27
- **Amends**: [ADR 0006](0006-orkeon-after-213.md)

## Context

Orkeon #217 is merged on Orkeon `main` (`db62c2ef`); no tag holds it yet. Beside the split-pane REPL's screen per
thread, which the documentation already follows, it closes five issues Orkeon Code had opened against the runtime of
ADR 0006 and changes the surface Orkeon Code runs on:

- **A spent token budget ends the act with a wrap-up** (#218). The sum of the prompt and completion of every call
  keeps its meaning, but once it reaches the limit `ctx.llm.act` runs no further tool, makes one last call that
  declares no tool, and resolves with that answer and `budgetExhausted: true`; only a failing or empty wrap-up still
  rejects. Orkeon Code read a spent budget off a rejection alone.
- **The access of a tool is declared per call** (#219). `github` reads for its read actions and executes for
  `create_issue`, `create_pr` and an unknown action; `http_api` reads for `GET`, `HEAD`, `OPTIONS` and a missing
  method; `rag_eval` and `web_search` read; an MCP tool declares what its `readOnlyHint` says. Orkeon Code described
  the former classes (`http_api` an execute, `github`, `rag_eval` and every MCP tool no access).
- **An async `completed`** (#220). The typings declare `completed` as `void | Promise<void>` and the host awaits the
  promise before the next completion; a rejection prints `Error in completed('<name>')` and keeps the instance's
  state. Orkeon Code's chained close used the mode read when the batch was launched.
- **A launch that keeps the parent's depth** (#221). `runCrewAsync(name, input, { chain: "continue" })`, from a
  `completed`, takes the depth of the instance whose `completed` runs; the chain refusal is reworded
  `chain depth <d> reached (MaxChainDepth <l>, /<command>)`. Orkeon Code's `/dev-batches` stopped after about two
  batches and read the former wording.
- **The `github` tool reads a token** (#222): `Orkeon:Tools:GitHub:Token`, else the variable
  `Orkeon:Tools:GitHub:TokenVariable` names (`GITHUB_TOKEN` by default), else `GH_TOKEN`, masked `***` in results and
  logs. Orkeon Code's Docker mode handed the container no such variable.

## Decision

- **The same pin.** `.orkeon-version` stays `1.0.0-rc.6`; the surface Orkeon Code targets is Orkeon `main` after
  #217, the one that tag will carry. The typings come from the sources until the tag (`scripts/sync-typings.sh` over
  `ORKEON_SOURCE`), as ADR 0002 to 0006 decided; the regenerated `orkeon-cli.d.ts` carries `CrewLaunchOptions`, the
  async `completed` and the `group` of a command, `orkeon.d.ts` the `budgetExhausted` flag of an act result.
- **The wrap-up of a spent budget is thrown, never resolved.** The Llm adapter turns an act result flagged
  `budgetExhausted` into a `BudgetExhaustedAnswer` (`shared/domain/llm-failure.ts`): the runtime's error name, the
  `tokens` dimension, the wrap-up as `answer`. The port's `act` keeps resolving to a finished answer alone, so the
  five callers that must not parse a cut-short answer (`runSubAgent`, the dev roles, the auditor, the repair run,
  `/analyze`) change nothing and keep reading a spent budget as they did off the runtime's rejection; the one caller
  that shows the wrap-up, the main loop, reads it off the error, prints it under a line saying the turn stopped on its
  budget, stores the wrap-up alone and makes no stop-check retry, which would meet the same spent budget. The
  alternative, `act` resolving to `{ text, budgetExhausted }`, would have touched every caller and every fake for
  one reader.
- **`/dev-batches` relaunches with `chain: "continue"`; `/dev-implement` climbs.** The `CrewHost` port gains the
  launch option, carried by the adapter, the fake and `launchCrew`. Every hop the `completed` of `/dev-batches`
  launches passes it, since a command runs only the `completed` of its own instances: a plan of any length closes in
  one command. `/dev-implement`'s own chain (the audit, the close: three hops at most from a typed command) keeps
  climbing, so a chain started by hand still meets the ceiling the operator configured. The chain refusal is read in
  its new wording alone, the command it names shown; nothing shipped with the former wording.
- **Each hop reads the session again, in `commands/_lib/`.** The `completed` of both commands is async and
  caught whole, so a failed read prints a line rather than the host's `Error in completed(...)`. Before a hop that
  writes (`/dev-implement`'s close; every hop of `/dev-batches` but the audit) the session's mode, rules and github
  tool are read again (`readPullRequestContext`): a read-only mode, or a mode that asks before a parallel wave,
  refuses the hop and names `/mode` and the command to type; otherwise the fresh context rides in the launch input,
  where the crews already prefer it to their record (`run-dev-implement.ts`, `run-dev-batches.ts`). A read that
  fails, or answers no mode, launches the hop as the crew named it and says so: the record's context is a fallback,
  never a refusal, since the dispatch did check the mode once. The logic sits in `nextLaunch` and
  `batchesNextLaunch`, tested over the fakes; a batch's close keeps `githubTool: false` whatever the session offers.
- **The catalogue keeps `github` and `rag_eval` with the edits, and `http_api` out of the read-only modes.** The
  per-call access decides what the gate asks; the class decides which modes see the tool at all. `github` can open a
  pull request and `rag_eval` re-ingests a corpus into a collection of the knowledge index, so neither belongs to a
  mode that promises nothing changes, whatever one call declares. `http_api` GET is an outbound request, observable
  elsewhere and able to carry the repository's content, so it stays withheld from `plan` and `dontAsk`. In `default`
  that GET now runs without a question: the gate offers no "ask" rule, so the permissions page says so and names the
  deny rule a project that must not reach out adds. The gateless fallback of the dev crews (`call-guard.ts`) reads
  the same table (`agent-policy/tool-access.ts`) in the writing modes and stays stricter in the read-only ones, as a
  fallback must not widen what the catalogue promised.
- **The speech server annotates its read-only tools.** `transcribe_audio`, `list_audio` and `whisper_info` carry
  `readOnlyHint=True`: the gate runs them in `dontAsk` without an allow rule. `record_and_transcribe`, `speak` and
  `stop_speaking` open the microphone or the speaker and carry none.
- **The token travels as a variable.** Both launchers' Docker mode hands `GITHUB_TOKEN`, `GH_TOKEN` and the variable
  `Orkeon__Tools__GitHub__TokenVariable` names to the container, each when set, with that setting itself. The
  configuration page recommends the variable over `Orkeon:Tools:GitHub:Token` in a settings file, and the example
  settings keep no token key.

## Consequences

- The roadmap loses two runtime items (the close re-reading the mode, a whole plan in one `/dev-batches`) and three
  known issues (the access classes of `github`, `rag_eval`, `http_api` and the MCP tools; the token the `github` tool
  lacked); the token-budget item says the answer is kept and what remains open, a budget that counts the context once.
- A `/dev-batches` run of three batches or more closes in one command; a mode switched to `plan` mid-run stops the
  next hop with the command to type, where the former chain went on with the mode it had read.
- Still to check live, against a build of Orkeon that includes #217: a run of three batches with `/inspect` showing
  the same depth on each hop, an audit whose token budget runs out writing the "did not finish" row, `/commit --pr`
  opening the pull request from the container with `GITHUB_TOKEN` exported, and `transcribe_audio` running in
  `dontAsk` without an allow rule.

## Alternatives considered

- **`act` resolving to `{ text, budgetExhausted }`**: the honest shape, but every caller and every fake would have
  changed for one reader; the thrown wrap-up keeps the port's contract and the readers of a spent budget as they are.
- **`chain: "continue"` in `/dev-implement` too**: its chain is bounded at three hops by construction, and a chain the
  operator starts by hand should still meet the ceiling they configured.
- **Refusing a hop whose context cannot be read**, as the dispatch does for a mode it cannot read: the dispatch did
  read the mode once for this run, and a failed read mid-run is a host failure, not a mode change; the hop goes on
  with the record's context and says so.
- **Moving `rag_eval` to the local reads** now that it declares a read: it writes a collection of the index, which
  `plan` and `dontAsk` promise not to do.
- **Keeping the question on an `http_api` GET in `default`**: the gate has no rule that asks, only allow and deny; a
  deny rule is documented for the projects that need it.
