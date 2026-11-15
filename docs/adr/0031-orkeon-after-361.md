# ADR 0031: Orkeon main after #361, `/effort` reads what the model takes

- **Status**: accepted
- **Date**: 2026-11-14
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0030](0030-orkeon-after-356.md)

## Context

Since Orkeon #356 the runtime judges an effort against the provider and the model, from one capability table: a
level the model does not take is sent as the highest it takes below (else the lowest it takes), an effort on a
model that takes none is dropped, and a model the table does not know gets the effort unchecked. A script could
not read any of it. `/effort` therefore offered its five levels on every model and answered `the provider's
thinking at 'medium'` on GLM-5.3, which received `low`; the runtime's log alone said so.

This project asked for the two reads on Orkeon (#359, #360), and Orkeon delivered them in #361 (`98799c6`, merged on
`main` on 2026-11-14):

- `LlmConfig.capabilities`: `{ model, known, thinking, efforts }`, the levels the provider and the model both take;
- `reasoning` on `LlmConfig`, on the results of `act` and `chat` and on a stream: `{ model, asked, sent, notice }`,
  `notice` being `lowered`, `dropped`, `unchecked` or null; `ctx.llm.reasoning(opts)` answers the same for a call
  inside an agent, without placing it.

Between the former pin (`3108dac`, #358) and #361, #362 made Z.AI take `xhigh` (GLM-5.3 keeps `low`, `high` and
`max`).

A first version read the session's `llm.profile` and the rungs of `/route` with `llm.profile(name)`. That call
throws on a name the host does not declare, and at `98799c6` the error crossed every `catch` of a script: run live
on a host declaring no profile, a bare `/route` (the default ladder `small,large`) died on it, as did `/effort`,
`/model` and `/config set llm.profile ghost`. The runtime listed no profile either. This project asked for both on
Orkeon (#364), and #365 (`2fb47b8`, merged on `main` on 2026-11-14) delivered them: `llm.profiles`, the names
`llm.profile` takes, and the refusals of the `llm` namespace, of the builders and of the factories as errors a
script catches. Just before it, #363 gave an agent a file-system scope (`.filesystem([...])`) and made the runtime
add a `## File system` section to the system prompt of every agent that has a file-system tool.

A refusal caught that way was a plain `Error`, told from another failure by a string only (`clrType`
`"InvalidScriptException"`). This project asked for a class (#366), and #371 (`791760e`, merged on `main` on
2026-11-14) delivered it: `InvalidScriptError`. The same merge makes the `output` of `crew.run()` the value the
last body returned, where an object gave its .NET type name (#369); every crew of this project returns a text.

A small model fills every optional field of a tool and sends `0` for a limit: `relational_database_query` then
returned no row and a success, and the crew reported figures of its own (#372, opened from this project's account).
#373 (`070a58e`, merged on `main` on 2026-11-14) makes every tool that reads a result limit refuse a value that
returns nothing, in a message naming the field and its default, and say so in the field's description.

The `## File system` section of #363 is written in the system prompt the runtime composes for a declarative turn.
Every agent of this project runs a body whose `act` sends this project's own system prompt, so none received it: a
main-loop request captured at `ff69e76` on a local server held the eleven sections of `docs/turn.md` and no such
section. This project asked for the text (#378), and #377 (`3a6a0d9`, the commit of Orkeon 1.1.0, merged on `main`
on 2026-11-14) delivered it: `ctx.fileSystem.prompt`, the section as a declarative turn holds it, empty when no
path is visible, when the agent has no file-system tool or when it sets `announceMounts(false)`.

## Decision

- **The pin moves to `98799c6`, then to `2fb47b8`** (#365), **to `791760e`** (#371), **to `070a58e`** (#373), **to `ff69e76`**
  (#374, a test of Orkeon alone), **to `3a6a0d9`** (#377), **then to `322ffb9`** (#380, the date of Orkeon 1.1.0 in its changelog alone), the newest merge commit of Orkeon `main`. The esbuild of the runtime (`0.25.12`) and its .NET SDK (`10.0.300`) do
  not change; the typings gain `EffortLevel`, `LlmCapabilities` and `LlmReasoning`, then `llm.profiles`,
  `.filesystem(...)` and `.announceMounts(...)`, then `InvalidScriptError`, then the minimum of each limit in its
  description.
- **The Llm adapter closes every act's system prompt with the runtime's section.** `agentLlm(ctx)` builds the
  adapter from the context the runtime hands a body, and each act that carries a system prompt ends with
  `ctx.fileSystem.prompt`, read at that act. One place, so the main loop, the crews, the dev roles and the
  background children all carry it, and no prompt of this project copies the runtime's wording. An act without a
  system prompt and a run where the runtime gives no text are sent as before.
- **No limit of this project changes at #373.** The adapters pass constants above 0 (`max_length`, `max_entries`,
  `max_nodes`, `top_k`, `max_lines`, `max_depth`, `max_results`), so no call of a script is refused. A model that
  sends `0` for a limit now reads the tool's refusal and its default instead of an empty result. `memory_recall`,
  this project's own tool, keeps raising a `top_k` below 1 to one entry: it never answered "nothing" for it.
- **The runtime judges, this project reads.** No copy of the capability table and no rule of its own: a new port,
  `ReasoningReader`, answers what a model takes and what a level becomes on it, from the `llm` namespace
  (`llm.profile(name)`, else `llm.model(name)`, else `llm.default_`, then `.capabilities` and
  `.with({ effort }).reasoning`; with no level, the bare `.reasoning`). The host's `Llm:ModelCapabilities` overrides are therefore honoured.
- **A named profile is read when the host lists it.** The reader compares the name to `llm.profiles`, trimmed and
  without case as `llm.profile` compares, and asks for the profile only then: a name the host does not declare
  answers nothing, and the commands say nothing of it. The profile is judged first, as the main loop runs on it: a
  `/model` override does not apply under one. A bare `/route` gives a line per rung with what its model takes, or
  what the stored effort becomes on it; `/config set llm.profile <name>` warns like `/effort`.
- **The file-system section of the runtime stays on, its default, and no agent declares a scope.** A scope per
  agent is another piece of work.
- **The model judged is the one the session's turns run on**: its `llm.profile`, else its `/model` override, else
  the host's own model. Under an override, the stored level is judged on the host's own model too, which the dev
  steps and the sub-agents keep: a second warning line, `⚠ effort, dev steps and sub-agents (the host's model): …`, says what it becomes
  there when that differs from the first line; `show` says the same under its thinking line, for the stored level,
  else for the host's own.
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
- On a runtime between #361 and #365 no profile is read: `llm.profiles` is absent there, and the reader answers
  nothing.
- The system prompt of every act grows by the runtime's `## File system` section, a few lines after this project's
  own text that do not change while the mounts do not: the cached prefix stays stable. On Orkeon 1.0.0 there is no
  `ctx.fileSystem` and the prompt is sent as before.
- The older `try … catch` around `llm.profile` (an agent routed to a rung the host does not declare stays on the
  crew's profile, `llm-profile.ts`) could not work before #365. It catches the runtime's `InvalidScriptError` alone
  (#366), read from the globals and handed over as `AgentFactories.refusal`: any other failure of `llm.profile` is
  thrown as it came. The reasoning reader keeps its wide `catch`: a command that only says what a model takes
  answers nothing rather than fail.
- A role's profile or a routed crew may put the dev steps on yet another model: their acts are still lowered by the
  runtime, with its warning, and no command of this project says it.
- A fallback profile is judged on its first link and a decision profile on its target (the runtime's rule): a call
  that fails over may be sent another level than the one announced.
- On a host with no provider, the first read of `llm.default_` logs the runtime's warning that no provider is
  configured: `/effort show` now raises it.
- Checks at `2fb47b8`: `npm run check` green; in source mode, `bash scripts/smoke-runtime.sh`, `bash
  scripts/smoke-crew.sh` and `bash scripts/smoke-validate.sh`. On a Z.AI host (`Llm:Thinking:Effort` = `medium`,
  GLM-5.3), at `2fb47b8`: `/effort show`, `/effort medium`, `/model <name>` and `/model reset` answer as above, the
  second line for the host's model included. On a host declaring the
  profiles `small` and `large` (GLM-5.3), at `2fb47b8`: `/route` names each rung's model, `/effort medium` and
  `/config set --session llm.profile large` (and `LARGE`) warn that `medium` is sent as `low`, and under
  `llm.profile ghost` every command answers and says nothing of the model. No model was called in these runs. Two live turns
  then ran at `2fb47b8` on Z.AI: under `llm.profile large` with `medium` stored the log read `act — effort: medium
  (sent as 'low' to glm-5.3)`, and with no level stored on a host asking for `medium`, `act — effort: none stored,
  the host asks for medium (sent as 'low' to glm-5.3)`; the runtime's warning said the same and the model answered.
- Checks at `791760e`: `npm run check` green and the three smokes in source mode. `git-commit` under `--llm-mock`
  with `llmProfile` = `ghost`: routed (`llmProfileFallback` given), the crew commits on the host's default model;
  launched on it, the crew fails on the runtime's refusal, which lists the known profiles.
- Checks at `070a58e`: `npm run check` green, the three smokes in source mode and the package installed in a
  scratch prefix, which names the pin. No model was called. The same at `ff69e76`, whose typings are those of
  `070a58e`.
- At `322ffb9`: the typings regenerated are those of `3a6a0d9`, `npm run check` green; no smoke was run again, the
  runtime's sources being the same.
- Checks at `3a6a0d9`: `npm run check` green, the smokes in source mode and on the 1.0.0 image and tool, the package
  installed in a scratch prefix. One main-loop request captured on a local server (no model called): the system
  message ends with `## File system`, the nine mounts of the session with their rights, `Relative paths resolve
  against /workspace.` and the note on read-write paths, after this project's eleven sections.