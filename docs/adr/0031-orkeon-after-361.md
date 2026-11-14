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

Between the former pin (`3108dac`, #358) and #361, #362 made Z.AI take `xhigh` (GLM-5.3 keeps `low`, `high` and
`max`).

## Decision

- **The pin moves to `98799c6`**, the newest merge commit of Orkeon `main`. The esbuild of the runtime (`0.25.12`)
  and its .NET SDK (`10.0.300`) do not change; the typings gain `EffortLevel`, `LlmCapabilities` and `LlmReasoning`.
- **The runtime judges, this project reads.** No copy of the capability table and no rule of its own: a new port,
  `ReasoningReader`, answers what a model takes and what a level becomes on it, from the `llm` namespace
  (`llm.model(name)`, else `llm.default_`, then `.capabilities` and `.with({ effort }).reasoning`; with no level,
  the bare `.reasoning`). The host's `Llm:ModelCapabilities` overrides are therefore honoured.
- **A named profile is not read.** `llm.profile(name)` throws on a name the host does not declare, and that error
  of the runtime crosses every `catch` of a script: run live on a host declaring no profile, a bare `/route` (the
  default ladder `small,large`) died on it, as did `/effort`, `/model` and `/config set llm.profile ghost`. The
  runtime lists no profile, so the name cannot be checked first. Under an `llm.profile`, and for the rungs of
  `/route`, the commands therefore say nothing of what the model takes. Orkeon is asked for the declared names, or
  for an error a script can catch (the issue prepared in `todo/orkeon-issue-profile-read/ISSUE.md`); with it, the
  reader judges the profile first, as the main loop does, and a bare `/route` gives a line per rung with what its
  model takes, or what the stored effort becomes on it.
- **The model judged is the one the session's turns run on**: its `/model` override, else the host's own model.
  Under an override, the stored level is judged on the host's own model too, which the dev steps and the sub-agents
  keep: a second warning line, `⚠ effort, dev steps and sub-agents (the host's model): …`, says what it becomes
  there when that differs from the first line.
- **`/effort` says it**: `show` lists the levels the model takes and what a stored level it does not take is sent
  as (`'medium' is sent to glm-5.3 as 'low' (it takes low, high, max)`); setting such a level warns under the
  answer; the panel marks each level that would be lowered or dropped. The set answer says the provider is asked
  for thinking at the level, not that it gets it.
- **The host's own effort is said.** With no level stored, a host's `Llm:Thinking:Effort` still goes out on every
  call: `show` names it (`not requested by the session; the host asks for 'medium'`) and what it becomes, and the
  turn's log line too (`act — effort: none stored, the host asks for medium …`).
- **The level stored stays the one asked.** The iteration ladder follows it, and the model may change with
  `/model`; the runtime lowers it at each call.
- **`/model` warns** after a switch or a reset when the stored effort does not go as asked on the new model; its
  panel, when it changes the model and the effort together, judges the new level only. **`/config unset
  llm.profile`** warns the same way.
- **A model the table does not know is said by `/effort show` only**, not warned of: its level goes out as asked,
  and most hosts serve such models.
- **The main loop's log line names the level sent** when it is not the one asked (`act — effort: medium (sent as
  'low' to glm-5.3)`), read from `ctx.llm.reasoning` through `Llm.effortSent`, on the agent's own provider, under a
  profile too: the agent already runs on it.
- **Nothing is said when the runtime cannot tell** (no provider, a runtime before #361): the answers are then the
  ones of before.

## Consequences

- The tool mode and the docker mode (Orkeon 1.0.0) have neither read: `/effort` and `/model` answer there as they
  did, and say nothing of the model's levels, until Orkeon's next release.
- Until Orkeon gives a safe read of a profile, a session on an `llm.profile` learns what its level becomes from the
  turn's log line alone, and `/route` names no rung's model.
- A role's profile or a routed crew may put the dev steps on yet another model: their acts are still lowered by the
  runtime, with its warning, and no command of this project says it.
- A fallback profile is judged on its first link and a decision profile on its target (the runtime's rule): a call
  that fails over may be sent another level than the one announced.
- On a host with no provider, the first read of `llm.default_` logs the runtime's warning that no provider is
  configured: `/effort show` now raises it.
- Checks at `98799c6`: `npm run check` green; in source mode, `bash scripts/smoke-runtime.sh`, `bash
  scripts/smoke-crew.sh` and `bash scripts/smoke-validate.sh`; on a Z.AI host (`Llm:Thinking:Effort` = `medium`,
  GLM-5.3) and on a host declaring no profile, `/effort show`, `/effort medium`, `/route`, `/model reset` and
  `/config set --session llm.profile ghost` answer as above.
