# ADR 0031: Orkeon main after #361, `/effort` reads what the model takes

- **Status**: accepted
- **Date**: 2026-11-14
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0030](0030-orkeon-after-356.md)

## Context

Since Orkeon #356 the runtime judges an effort against the provider and the model, from one capability table: a
level the model does not take is lowered, an effort on a model that takes none is dropped, and a model the table
does not know gets the effort unchecked. A script could not read any of it. `/effort` therefore offered its five
levels on every model and answered `the provider's thinking at 'medium'` on GLM-5.3, which received `low`; the
runtime's log alone said so.

This project asked for the two reads on Orkeon (#359, #360), and Orkeon delivered them in #361 (`98799c6`, merged on
`main` on 2026-11-14):

- `LlmConfig.capabilities`: `{ model, known, thinking, efforts }`, the levels the provider and the model both take;
- `reasoning` on `LlmConfig`, on the results of `act` and `chat` and on a stream: `{ model, asked, sent, notice }`,
  `notice` being `lowered`, `dropped`, `unchecked` or null; `ctx.llm.reasoning(opts)` answers the same for a call
  inside an agent, without placing it.

Between the two, #362 made Z.AI take `xhigh` (GLM-5.3 keeps `low`, `high` and `max`).

## Decision

- **The pin moves to `98799c6`**, the newest merge commit of Orkeon `main`. The esbuild of the runtime (`0.25.12`)
  and its .NET SDK (`10.0.300`) do not change; the typings gain `EffortLevel`, `LlmCapabilities` and `LlmReasoning`.
- **The runtime judges, this project reads.** No copy of the capability table and no rule of its own: a new port,
  `ReasoningReader`, answers what a model takes and what a level becomes on it, from the `llm` namespace
  (`llm.profile(name)`, else `llm.model(name)`, else `llm.default_`, then `.capabilities` and
  `.with({ effort }).reasoning`). The host's `Llm:ModelCapabilities` overrides are therefore honoured.
- **The model judged is the one the session's turns run on**: its `llm.profile`, else its `/model` override, else
  the host's own model, the rule of the main loop.
- **`/effort` says it**: `show` lists the levels the model takes and what a stored level it does not take is sent
  as; setting such a level warns under the answer; the panel marks each level that would be lowered or dropped.
- **The level stored stays the one asked.** The iteration ladder follows it, and the model may change with `/model`
  or `llm.profile`; the runtime lowers it at each call.
- **`/model` warns** after a switch or a reset when the stored effort does not go as asked on the new model.
- **`/config set llm.profile` warns the same way** when the session's profile changes, and **a bare `/route` lists
  each rung of the ladder** with what its model takes, or what the stored effort becomes on it: a routed crew runs
  on a rung with the stored effort.
- **A model the table does not know is said by `/effort show` only**, not warned of: its level goes out as asked,
  and most hosts serve such models.
- **The main loop's log line names the level sent** when it is not the one asked (`act — effort: medium (sent as
  'low' to glm-5.3)`), read from `ctx.llm.reasoning` through `Llm.effortSent`, on the agent's own provider.
- **Nothing is said when the runtime cannot tell** (no provider, a profile the host does not declare, a runtime
  before #361): the answers are then the ones of before.

## Consequences

- The tool mode and the docker mode (Orkeon 1.0.0) have neither read: `/effort` and `/model` answer there as they
  did, and say nothing of the model's levels, until Orkeon's next release.
- The dev steps and their agents may run on other models (a role's, a routed profile): `/effort` judges the
  session's model only, and `/route` the rungs. Their own acts are still lowered by the runtime, with its warning.
- A fallback profile is judged on its first link and a decision profile on its target (the runtime's rule): a call
  that fails over may be sent another level than the one announced.
- Checks at `98799c6`: `npm run check` green; in source mode, `bash scripts/smoke-runtime.sh`, `bash
  scripts/smoke-crew.sh` and `bash scripts/smoke-validate.sh`.
