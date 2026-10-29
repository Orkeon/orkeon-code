# ADR 0012: Orkeon main after #239, the exclusive crew launch

- **Status**: accepted
- **Date**: 2026-10-29
- **Amends**: [ADR 0010](0010-orkeon-after-234.md), [ADR 0011](0011-dev-gates-and-surface.md)

## Context

Round 2 of ADR 0011 folded `/security-review` and `/passes` into `/review`, `/feedback` and `/memory-admit` into
`/memory`, and met a quota problem: `maxConcurrent: 1` counts every line typed under any name of a command, so it
refused `/passes [n]` while a review ran and `/memory list` while an admission's crew wrote. The first answer, the
same day, was a port `RunningCrews` over the host's `commands` service: the command listed the running instances of
its crew and refused the line itself. It worked within one REPL, with a window between the check and the launch, and
it needed an adapter, a fake and two refusal texts for what is the host's business: one crew at a time.

Orkeon #239 asked the runtime for that primitive; Orkeon #240 (`3fcfbbe`, 2026-10-29) ships it on `main`:
`script-host.runCrewAsync(name, input, { exclusive: true })` refuses a crew whose previous exclusive launch is not
terminal, before any LLM call, with a JS throw naming the running instance, `crew 'code-review' already running
(ticket t2)`. The check and the registration of the instance are one step (`CommandDispatchService.postWork(...,
exclusive: true)`, `ExclusiveLaunchRefusedException`); the crew is free again once that instance completes, fails
or is cancelled; a launch without the option is neither refused nor counted; `chain` and `exclusive` combine.

The pinned release, `1.0.0-rc.6`, reads `options.chain` only (`ScriptHostFacade.ReadContinueChain` at the tag) and
ignores every other key: on it the option is silent, no error, no exclusivity.

## Decision

- **The commands use the runtime's option.** `/review` launches `code-review` and `/memory admit` launches
  `shared-memory-admit` with `{ exclusive: true }` (`CrewLaunchOptions.exclusive`). `launchCrew` reads the refusal off
  the throw (`shared/domain/agents/exclusive.ts`, `exclusiveRefusal`, beside the chain's `chainDepthRefusal`) and
  hands the runtime the line it prints: `<crew> not launched: it is already running (ticket <t>); wait for its
  result, then type the line again.` Any other throw still propagates.
- **The script-side check goes.** The port `RunningCrews`, its adapter `running-crews.ts`, the doubles
  `FakeRunningCrews` and `FakeCommandsService`, `reviewBusyText` and `admitBusyText` with their tests are removed:
  nothing of Orkeon Code reads the `commands` service any more. An admission is now confirmed first and refused at the
  launch when the previous one still writes; the texts said "before its questions", they no longer do.
- **The reference runtime is the source checkout.** The owner's decision of 2026-10-29: Orkeon Code is validated
  against Orkeon `main`, built from the sources (`ORKEON_SOURCE`, the smoke's source mode), not against the image
  or the packages of the pinned release. `.orkeon-version` stays `1.0.0-rc.6` for the install paths (apt, the
  dotnet tool), the smoke's `ORKEON_SOURCE_REF` moves to `3fcfbbe`, the typings are regenerated from it. No guard
  keeps `exclusive` out of the sources, unlike `.decision(` and `.when(` (ADR 0010): the option neither typechecks
  wrongly nor fails on rc.6, it is ignored there, and the one-at-a-time it gives is a convenience of the REPL, not a
  correctness rule the crews depend on (the memory collection keeps its own lock, a review writes nothing).

## Consequences

- On a runtime after #240, two `/review` lines in a row answer `code-review not launched: it is already running
  (ticket t2); …` for the second, before any LLM call; `/passes 3` and `/memory list` answer during a run; a
  `/memory admit` confirmed while the previous one writes is refused with the ticket.
- On `1.0.0-rc.6`, the second review runs beside the first, as before the fold (the two commands then had their own
  quota). The next pin on a release that ships #240 closes that gap without a change here.
- The check made for this ADR: `npm run check` and the runtime smoke on `3fcfbbe` in source mode. Not run live: two
  `/review` lines in one REPL.
