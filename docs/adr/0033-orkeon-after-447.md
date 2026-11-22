# ADR 0033: Orkeon main after #447, budgets the runtime now refuses, and what stays this project's own

- **Status**: accepted
- **Date**: 2026-11-22
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0031](0031-orkeon-after-361.md),
  [ADR 0027](0027-decision-model-optimisations.md), [ADR 0032](0032-pruning-in-the-dev-acts.md)

## Context

Orkeon `main` moved from `30a61f8` (#423) to `5dc2ff3` (#447, merged on 2026-11-21), five commits:

- `02a9c8b` (#425): `--validate` finds the typings a crew references under TypeScript 7 (fixes #424, which this
  project opened);
- `91794a4` (#427): Orkeon's own CI;
- `ec1983f` (#428): `spawn_agent` from an act that names no budget has no five-minute clock any more (fixes #426);
- `317d3d6` (#438, issues #429 to #437): a crew declares what it needs from System One (`decision({ mode })`, the
  `without` relay), every System One consumer follows the decision circuit, agent loops compact against the model's
  window, pruning of read-tool results, `llm.profile: auto`, skills for YAML agents, and a budget that names some
  dimensions leaves the others uncapped;
- `5dc2ff3` (#447, issues #439 and #445): `effort: "auto"`, picked by System One at a task's start, and a tool
  bridge (`orkeon bridge serve`) that runs chosen tools on the user's machine for a runtime in a container.

The tool on nuget.org and the image stay at `1.3.0`, six commits behind the pin.

Three changes break what this project relies on:

- **A budget refuses a limit below 1** (#436). The reader of a procedural `budget({...})` and of the `budget` option
  of `crew.runAgent` used to skip a value of 0 or less and apply its default; it now refuses the run before its
  first agent. Five budgets of this project set `delegationDepth: 0` (the dev-implement run and its close, the
  dev-batches driver and its waves, the repair run of agent-run): each crew would have stopped at its start.
- **`auto` is a reserved profile name** (#434): a host declaring `Llm:Profiles:auto` or
  `Orkeon:Decision:Profiles:auto` is refused at start.
- **With the decision circuit off, `system_one_decide` is withheld** (#433): `--no-decision`,
  `Orkeon:Decision:Enabled=false`, or no provider.

## Decision

- **The pin moves to `5dc2ff3`**, the newest merge commit of Orkeon `main`. The typings gain `AgentEffort`
  (`EffortLevel | "auto"`), `taskBuilder().withEffort`, `crewBuilder().decision({ mode })`, the `without` relay of
  a decision task and `"auto"` in `LlmReasoning.asked` and `notice`. The test double of the `llm` namespace keeps a
  configuration's own effort on `with({ effort: "auto" })`, since `auto` is a pick made at a task's start.
- **A budget that starts no child names no depth.** `StepBudget.delegationDepth` becomes optional and the five
  budgets leave it out. The runtime had been ignoring their 0 and applying its default depth, 2, so the runs behave
  as before; no budget can say "no child", the agents' tools hold it. A test per budget module checks that every
  limit is a whole number of 1 or more (`tests/support/assertions/budget.ts`), over the inputs a crew may be given.
  The dev-batches driver floors its `concurrency` first: a fractional wave size made a fractional tool-call count.
- **The running-sum token cap was never ours to set.** Before #436 a budget naming `contextTokens` without `tokens`
  already left the running sum uncapped, which is why the old default of 16 000 tokens never cut a step; at the pin
  every left-out dimension is uncapped. The budgets keep the dimensions they name.
- **`auto` is refused as a profile name** by `llm.profile` and as a rung of `route.ladder`, in any case, with a
  message that points to `/route`: no host can declare it, and the commands' agents never get the runtime's pick.
- **The decision adapter does not change.** It looks `system_one_decide` up by name and answers nothing when the
  host does not register it, which is what a withheld tool looks like. A name listed in `tools.extra` is left out
  with the existing warning. The guides say so ([permissions](../permissions.md), [architecture](../architecture.md)).
- **The smoke type-checks with the runtime's own TypeScript.** Since #425 the TypeScript 7 of an Orkeon checkout's
  `tools/scripting-typecheck` accepts these crews: `runtime-smoke.yml` installs it and no longer names this
  project's compiler through `Orkeon:Scripting:Toolchain:TscPath`. Run at the pin, all 18 crews pass `--validate`.

### What is not adopted, and why

Every agent of this project is a `.body()` agent: it calls `ctx.llm.act` and never runs as an orchestrated task.
The runtime's System One features run in the task pipeline (`ExecutionOrchestrator`, the native and chat-client
agent loops), and `ctx.llm.act` offers only the `onContextPressure` callback (#327). So:

- **Compaction by default** (#432) reaches no loop of this project: no `Orkeon:Compaction` in the example settings.
  The main loop's own compaction (`src/shared/application/compaction/`) stays.
- **Pruning** (`Orkeon:Compaction:Prune`, #434) is not exposed to a script's act. This project's pruning
  (ADR 0027, ADR 0032) stays; both share their numbers, but they never run on the same conversation.
- **`llm.profile: auto` and `effort: "auto"`** are picked at a task's start; an act gets no pick
  (`JsLlmFacade` leaves `auto` to the agent's own thinking). `/route` and `/effort` stay as they are.
- **`decision({ mode })`** has no effect on a procedural crew, and no crew of this project declares decision tasks.
- **Skills** (#434) are for YAML agents.
- **The tool bridge** (#445) is not wired in the launcher yet: a separate change.

A request to give `ctx.llm.act` the runtime's pruning and a profile and effort pick is prepared for Orkeon, so that
this project can drop its own copies of the algorithm later.

## Consequences

- The crews start on the pin; on `1.3.0` (the tool and docker modes) the budgets behave the same, since that
  release ignored the 0.
- A depth of "no child" is no longer written anywhere; a budget that starts children names its depth (1 for the dev
  steps, 2 for the main loop).
- A user whose host declared a profile `auto` is told before the runtime refuses the host.
