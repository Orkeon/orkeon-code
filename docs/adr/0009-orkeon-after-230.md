# ADR 0009: Orkeon main after #230, on the rc.6 pin

- **Status**: accepted
- **Date**: 2026-10-27
- **Amends**: [ADR 0008](0008-orkeon-after-223.md)

## Context

Orkeon #230 is merged on Orkeon `main` (`7ff12c9`); no tag holds it yet. It delivers the six issues Orkeon Code
opened on 2026-10-27, once #223 was adopted, for what stayed the runtime's (PR #31 cited them in the roadmap):

- **#224, a token budget that counts the context once**: `budget({ contextTokens })` next to `tokens`. Each call
  charges its completion plus the part of its prompt the provider's cache did not serve, else what the prompt grew
  by since the same conversation's previous call; set alone, it leaves the running sum uncapped; exhaustion triggers
  the same #218 wrap-up, reported on the `tokens` dimension. The main loop ran with a 1.5M running sum since a turn
  of 17 reads had spent 425k of a 400k sum, and the dev steps sized their sum as `calls × 3 500`.
- **#225, the runtime version for a scripted command**: `ctx.services.get("runtime")` answers `{ version, commit,
  channel }`, always present. `/status` named the pin of `.orkeon-version` as the runtime, and `/doctor` sent the
  operator to `orkeon-code --version` for the one found.
- **#226, the session's usage by category**: `ctx.services.get("usage").report()` gives the totals, `unpricedCalls`,
  a `cost` that is null while no call was priced, and rows `byModel` and `byCommand`; `token_budget` adds
  `used_tokens_by_kind`. `/usage`, `/context` and `/cost` showed totals only, their logic in the entry points.
- **#227, the session saved and loaded from the REPL**: `ctx.services.get("session")` offers `save(path?)` and
  `load(path)` at virtual paths, while `Orkeon:Cli:Session:Persist` is on (the REPL's default). `load` judges the
  file whole before swapping the buffer, the state bag, the id and the title; the session goes on saving to its own
  file, so the loaded one overwrites it at the next turn. `/resume` listed the history the launcher mounts read-only
  on `/session-history` and asked for a restart.
- **#228, the answer printed twice**: `CommandResponse.streamed` and `CrewRunOutput.streamed` are true once any turn
  of the request was written to the console in the foreground. `writeCompleted` printed every payload.
- **#229, `Orkeon.Scripting` as a package**: `services.AddOrkeonScripting()` and `ICrewScriptRunner.RunAsync` run a
  `crew.ork.ts` in-process; esbuild is found on `PATH`, `ORKEON_ESBUILD_PATH` or a setting.

Checked in the runtime before adopting #224: a `crew.ork.ts` goes down the declarative pipeline, where
`JsBudgetBridge.ToCrewBudget` refuses `contextTokens` on an autonomous crew, only when its own text matches
`globalThis…crew =` (`CrewHandoffDetector`). The crews of Orkeon Code call `publishCrew(...)`, the assignment living
in `globals.ts`, so they take `CrewRunScope` and `FromSpec`, which accepts the dimension and uncaps the sum when
`tokens` is left out.

## Decision

- **The same pin.** `.orkeon-version` stays `1.0.0-rc.6`; the surface Orkeon Code targets is Orkeon `main` after
  #230, the one that tag will carry. The typings come from the sources until the tag (`scripts/sync-typings.sh` over
  `ORKEON_SOURCE`), as ADR 0002 to 0008 decided; the runtime smoke builds `7ff12c9`.
- **Every crew budget counts the context once.** The `tokens` dimension of `StepBudget`, `implementBudget`,
  `batchLimits`, `driverBudget` and the main loop is `contextTokens`. The dev steps keep their figures: `calls ×
  TOKENS_PER_CALL` approximated the growth each call adds, which is what the context counted once charges. The main
  loop goes from the 1.5M running sum to 700k context tokens, 200 calls of 3 500, the dev steps' rule; a live turn
  of forty iterations will say whether the figure holds. `tokens` is left out everywhere, so the sum is uncapped
  rather than cut short of the context asked for. A repository test keeps every `crew.ork.ts` free of a plain
  `globalThis.crew =`, the text that would send it down the path where the dimension is refused.
- **The running runtime is read, the pin kept.** A port `RuntimeInfoReader` over the `runtime` service; `/status`
  names `Orkeon <version>[+<commit>] (<channel>)` and whether it is the pin, `/doctor` passes on the pin and warns
  on another version. `ORKEON_RUNTIME_VERSION` stays the pin, kept equal to `.orkeon-version` by the version test:
  it is what the commands were checked against.
- **The usage by category comes from the host's account.** A port `UsageReader` over the optional `usage` service,
  undefined when the host keeps none; `TokenBudget.byKind` from `used_tokens_by_kind`. `/usage` closes with the rows
  by model and by command and the lower-bound note, `/context` adds one column per kind, `/cost` shows the account's
  cost or `(unpriced)` and its unpriced count. The logic of the three commands moves from the entry points into
  `commands/_lib/status/`, where it is tested, as the architecture rule asks.
- **`/resume <number or id>` switches in place, the session of now archived first.** A port `SessionSwitch` over
  the optional `session` service. The command saves the session to its own file, writes it again to
  `<own folder>/<stamp>-archived.json` (the clock port names it; `/sessions` is mounted read-write, the history is
  not), then loads the chosen history file and records its name in the loaded session's state bag, so the listing
  marks it. A refused load leaves the session unchanged and says so; a host without the service is told to restart
  with `orkeon-code --resume <id>`. Both launchers archive every `*.json` of `sessions/*/` and `side/*/*/`, the
  archives first and `last.json` last so it is the newest, and before a file lands in the history they drop every
  history file of the same `SessionId`, read from the file (never from the name, which is sanitised and may carry a
  collision suffix): a session loaded in place goes on under its id, and its new file replaces the one it came from.
- **A streamed answer is printed once.** `CrewCompletion` carries `streamed`; `writeCompleted` prints nothing for a
  success the console already showed, and the failure line always.
- **The roadmap loses what #230 delivered.** The quadratic-budget and printed-twice known issues, the sessions and
  the cost items, the `/status`, `/context` and `/usage` parts of the half-done commands; the in-process embedding
  item names what remains ours now that `Orkeon.Scripting` ships.

## Consequences

- An `/assistant` turn is bounded by the context it builds, not by the square of its calls: a turn that reads many
  files no longer meets the budget at the seventeenth read. The `BudgetExhaustedAnswer` reading of the main loop and
  `readBudgetExhausted` of the dev steps are unchanged, the runtime reporting the exhaustion on `tokens`.
- `/status` on a build of `main` says `Orkeon 1.0.0-rc.6+<sha> (source), the pin of .orkeon-version`; on a later
  release it says it is not the pin, and `/doctor` warns, until the pin moves.
- `/resume 1` swaps the conversation without a restart; the next start of `orkeon-code` shows one history file per
  session id, the archive of the session left and the continuation of the one loaded.
- Still to check live, against a build of Orkeon that includes #230: the `context counted once` log line and a long
  turn under 700k; the `streamed` flag on the crews `dispatch.ts` launches (the runtime reports false for background
  and labelled output: if the launched crews stream that way, the payload is still printed once by the runtime and
  once by `writeCompleted`, and the `ConsoleStreaming` caveat comes back); a `/resume` round trip followed by a
  restart.

## Alternatives considered

- **Keeping `tokens` beside `contextTokens`**: the first one spent ends the act, and a running sum sized for the
  context once would cut a long turn short of the context it asked for; the sum is left uncapped instead.
- **Keeping the main loop at 1.5M context tokens**: a ceiling the context window never reaches, which bounds nothing;
  700k follows the rule the dev steps already apply, to be confirmed live.
- **Loading without archiving**: the loaded session overwrites the session's own file at the next turn, and the one
  left would be lost; the archive costs one write.
- **Mounting `/session-history` read-write to archive there**: the history is the launcher's, named and pruned by it;
  the archive goes beside the session's own file, where the launcher already looks.
- **Deduplicating the history after the move**: the new file would then take a collision suffix when it lands in
  the same second as the one it replaces; the old file goes first, and the new one keeps the plain name.
