# ADR 0024: what Orkeon #299 adds, adopted or set aside

- **Status**: accepted
- **Date**: 2026-11-08
- **Amends**: [ADR 0023](0023-orkeon-after-306.md)

## Context

ADR 0023 moved the pin to `4357d82` and adopted what the three merges changed under Orkeon Code's feet: the order of
`onToolCall` and the gate, the guardian's section, the link rule, the embedding fingerprint. Orkeon #299 is also 28
framework lots that add capabilities, most of which this project did not use. An inventory of the runtime's changelog
and typings between `b0fa31f` and `4357d82`, and a survey of where Orkeon Code is exposed, sit under
`todo/orkeon-after-299/` (`inventory-runtime.md`, `exposure-orkeon-code.md`, `PLAN.md`); this ADR records what they
decided.

Two facts settle most of it. Every crew of this project ends with `publishCrew(crew)`, that is `globalThis.crew = …`:
for `orkeon run` it is a *declarative* crew definition, run through the shared pipeline, so `orkeon run --test` (the
`test` global) is refused and `--llm-mock`, `--llm-record` and `--llm-replay` apply. And no crew uses `taskBuilder()`:
every agent drives `ctx.llm.act` and `extract`, which a crew task's `retry:` does not cover.

## Decision

**Fixed at once** (PR #79): the whisper server's calls outlast the new `MCP:Servers:<id>:CallTimeout` of 60 s; the
example settings and the launchers set 15 minutes. `Orkeon:Tools:Shell:WindowsPaths` enters the guides.

**Documented** (this ADR's PR): what a user of Orkeon Code meets when they touch the runtime's settings.

- `MCP:Servers:<id>`: `CallTimeout`, `ConnectTimeout`, `Tools:Allow`/`Tools:Deny` (filtered before registration, so
  `tools.extra` warns of a denied tool; the whisper tools `/voice` and `/say` call are never denied), `Headers`, `Auth`
  (Bearer, Basic, OAuth 2), the https rule, `Transport: Sse` as Streamable HTTP. A plugin is a folder with `plugin.json`.
- `Llm:ModelCapabilities:<id>`: an `effort` a listed model does not take is dropped with a warning.
- `Orkeon:Guardian:Llm:Phases: Output` judges crew tasks only, never `ctx.llm.act`; it holds a task's deltas.
- `Orkeon:CognitiveMemory:Enabled` stays off: the runtime's `memory_recall` would share its name with this project's
  own tool. Renaming ours (`shared_memory_recall`) would break the permission rules users wrote; not done.
- A `spawn_agent` child runs under the stricter of its mode and its spawner's; this project's children name none.
- Headless: exit `75` and `--resume <id> --input` under `Orkeon:Checkpointing:Enabled` (off everywhere; a headless
  `human_input` still gets the default value), `/state` and `/runs` reserved, `Orkeon:RunHistory` and `orkeon runs`,
  the wall-time budget that stops while an approval waits, a path that leaves the mount through a link.
  `scripts/dev-run.sh` maps exit `75` to its exit `3` (a human decides), reachable only with checkpointing on.
- The embedding providers `mistral`, `azure-openai`, `gemini`; `.orkeon/state` in the list of what is written.

**Adopted** (the plan's PR 3): a crew turn without a key in CI, `git-commit` under `orkeon run --llm-mock` on a fresh
copy of the demo fixture (`scripts/smoke-crew.sh`, the model's one answer in `tests/fixtures/llm-mock/git-commit.jsonl`,
the fixture's `HEAD` checked against it), run by `runtime-smoke.yml` after the REPL smoke.

**Adopted** (the plan's PR 4): `Llm:Profiles:small:Fallback: ["large"]` in the Jev, Kev and Liquid examples, the key
and `FallbackBudgetSeconds` in the configuration guide, the move the decision profile does not see in the local-models
guide; `scripts/dev-run.sh` keeps its whole-process retry on a 429, now the step after the runtime's own.

**Set aside**:

| Feature | Why not |
| --- | --- |
| `taskBuilder().retry` | no `taskBuilder()` here; the project's two-attempt loops repair an answer's shape, which a blind replay would not |
| `onToolCallDelta` | rendering a tool call as it is built is the host console's; this project has no crew-side renderer |
| `Orkeon:CognitiveMemory` | the shared memory of ADR 0017 does the work; the name clash above |
| `--resume`, checkpointing, run history | the REPL resumes its own sessions; a `/dev-batches` chain runs in one process; revisit if a headless chain needs a durable question |
| `mcp serve --crew`, `eval run`/`bench`, the host API, A2A `input-required`, YAML `graph:`, `dotnet new` templates | this project serves nothing, runs no eval, hosts no API, has no YAML crew |
| `Llm:ModelCapabilities:AudioInput` | a later option beside the whisper server |
| cassettes (`--llm-record`/`--llm-replay`) | keyed on the system message: every prompt change re-records; the mock serves the smoke first |
| `orkeon run --validate` on every crew | at the pin it refuses what `orkeon run` executes: `git-commit` ("At least one task is required", a crew whose work is its agents' bodies) and `main-loop` (`budget.contextTokens`, which the REPL accepts); with the type check on, a crew's `/// <reference path="../.orkeon/orkeon.d.ts" />` and the runtime's `/typecheck/orkeon.d.ts` declare every identifier twice (TS6200). To report to Orkeon; revisit when `--validate` loads a crew as `run` does; Orkeon #317 did, and [ADR 0025](0025-orkeon-after-317.md) adopts it |

## Consequences

- The pin moves to `1a10f97` (`1a10f9765d7074dbe7c339b496320c20b929ad92`, Orkeon #309), the merge of `main` that
  follows `4357d82`: it bumps Orkeon's `backstage` submodule only, so no runtime file nor typing changes and the checks
  of ADR 0023 hold.
- The guides (`configuration`, `permissions`, `extending`, `architecture`, `shared-memory`, `headless`,
  `getting-started`, EN and FR) name the new keys where a user meets them, each with its Orkeon issue; the examples
  gain no key besides the whisper `CallTimeout` until PR 4.
- `scripts/dev-run.sh` has a line for exit `75`; its test table has the case.
- Nothing of this ADR was checked live against a model or a checkpointed run: the exit `75` path and the `Output` phase
  are the runtime's documented behaviour, read in its changelog and settings catalogue at `4357d82`.
