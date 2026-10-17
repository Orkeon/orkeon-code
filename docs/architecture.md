# Architecture

Orkeon Code is the TypeScript half of a coding agent; the [Orkeon](https://github.com/Orkeon/orkeon) runtime is the
other half. This page describes how the two meet, the constraints the runtime sets, the layers of the sources and
the rule between them, how a request travels, and how to extend the code. The reasons for the layering are recorded
in [ADR 0001](adr/0001-clean-architecture.md).

## Two halves

| This repository (TypeScript) | The Orkeon runtime (.NET, pinned in `.orkeon-version`) |
|---|---|
| Slash commands (`src/commands/*.cmd.ts`) | The scripted-commands REPL that loads them (`orkeon-repl --runner=scripted-commands`) |
| Crews (`src/crews/<name>/crew.ork.ts`) | The script engine (Jint) and the bundler (esbuild) that run them |
| Prompts, parsing, decisions (`domain/`, `application/`) | The tools (files, shell, git, code intelligence, web, session, memory) |
| The permission catalogue per mode, the session's rules | The permission gate that checks every tool call of the model (`act`) against the rules and the mode, and asks the operator |
| | The VFS: `/workspace`, `/output`, `/tmp`, the read-only `/crews` and `/cli-commands` |
| | LLM providers, streaming, cost and token accounting |

## Runtime constraints

The runtime runs the sources under rules that shape everything below:

- **One bundle per entry point.** Each `*.cmd.ts`, `crew.ork.ts` and `probe.ork.ts` is bundled alone by esbuild
  (`--platform=neutral`, the runtime's flags, reproduced by `npm run bundle:check`) and evaluated by Jint. A module
  that several entry points import is copied into each bundle.
- **Jint, not Node.** No `node:` module, no `process`, no npm package, no timer. The runtime's API is its globals
  (`tools`, `agentBuilder`, `crewBuilder`, `inputs`) and the context it hands each command handler and agent body
  (`ctx`: `llm`, `log`, `state`, `services`...).
- **No shared instance.** Nothing lives across bundles: a module-level object exists once per bundle and per run. A
  registry, a container or a cache shared by the commands and the crews cannot exist.
- **The session state bag is the only shared state.** Commands, crews and turns share what the session holds: the
  conversation buffer and the state bag (`session_store`), cleared by `/reset-session`. Typed memory and the
  settings file (`/workspace/.orkeon/config.json`) are the durable stores.
- **A crew loads synchronously and sees only its `inputs`.** Its module scope cannot await: what decides the tool
  catalogue (the mode, the extra tools, the permission rules) is resolved by the launching command and reaches the
  crew as input.
- **A command file exports nothing.** The loader evaluates a `*.cmd.ts` as a script and loads every file matching
  that pattern: shared command code lives in `commands/_lib/`.
- **Relative imports name their `.ts` file**, as the bundler resolves them as written; there is no path alias.
- **Erasable TypeScript only** (`erasableSyntaxOnly`): Node runs the tests by stripping the types, so no `enum`, no
  `namespace`, no parameter property.
- **An unknown name in `.tools([...])` fails the turn**: `act` throws `UnknownToolError` before the model is asked,
  so a catalogue names only tools the host registers (the extra tools are checked against them at launch).

So each entry point is its own composition root: it builds the adapters it needs and hands them to a use case that
takes its dependencies as parameters. The ports are interfaces, erased from every bundle, and a test imports a use
case in Node without touching a runtime global.

## Layers and the dependency rule

| Layer | Where | Holds | Imports |
|---|---|---|---|
| domain | `src/shared/domain/`, `src/crews/<name>/domain/` | Pure types and functions: rules, prompt text, parsing, rendering | domain only |
| application | `src/shared/application/`, `src/crews/<name>/application/` | Use cases and services over the ports (`ports.ts`) | domain, application |
| infrastructure | `src/shared/infrastructure/` | `globals.ts`, the Orkeon adapters of the ports, `wiring.ts` | anything inward |
| command use cases | `src/commands/_lib/` | One module per command family, `run<Name>(tokens, deps)` → a view over the ports it is handed; the helpers the commands share | anything but `shared/infrastructure/` |
| entry points | `src/commands/*.cmd.ts`, `src/crews/<name>/crew.ork.ts` | Parse the input, wire the adapters, call a use case, render | anything |

`tests/architecture.test.ts` parses every import of `src/` (static, re-export, type-only and dynamic) and fails on
any import that breaks one of these rules; there is no exception list:

- a file under `domain/` imports domain files only;
- a file under `application/` never imports `infrastructure/`;
- a file under `domain/` or `application/` never imports `commands/` nor an entry point (`*.cmd.ts`, `crew.ork.ts`,
  `probe.ork.ts`);
- only `shared/infrastructure/` and the crew entry points (`crew.ork.ts`, `probe.ork.ts`, which need the builders and
  `inputs()`) import `globals.ts`: a command reaches the runtime through the adapters of `orkeon/wiring.ts`;
- `commands/_lib/` never imports `shared/infrastructure/`: the entry point builds the adapters and hands them over,
  so a test imports the use cases over the fakes;
- a relative import names its `.ts` file, and runtime code imports nothing but relative files (tests may import
  `node:` built-ins);
- runtime code never imports `tests/`: the test doubles are never bundled;
- no import cycle between files.

The same test reads the runtime globals with TypeScript's own scoping, file by file: an identifier its file does not
declare, import or bind, a `globalThis.<name>`, and an ambient re-declaration (`declare const tools`) are uses of a
global. `src/crews/.orkeon/orkeon.d.ts` declares the runtime's globals for every file, so the type check alone would
let any module call `tools.shellCommand(...)`:

- no `require()`: the sources are ES modules bundled by esbuild;
- only `shared/infrastructure/` and the crew entry points read `tools`, `agentBuilder`, `crewBuilder` and `inputs`;
- only a `*.cmd.ts` calls `defineCommand` or `defineAsyncCommand`: a toggle command registers the descriptor that
  `_lib/session-config.ts` builds (`defineCommand(toggleCommand(spec, session))`).

```text
src/
├── commands/          60 *.cmd.ts (parse, wire, render)
│   ├── _lib/          one module per command family: run<Name>(tokens, deps) → CommandView, or
│   │                  dispatch<Name>(tokens, deps) → a ticket or a message when the command launches a
│   │                  crew (say, transcribe, voice), and its pure helpers (agents, branch, config, diff, doctor,
│   │                  export, memory, mode, model, permissions, say, skills, status, transcribe, voice);
│   │                  args.ts (arguments), dispatch.ts (crew launch,
│   │                  completion line, main-loop launch), session-config.ts (toggle commands),
│   │                  view.ts (CommandView, showView), meta.ts (version, release notes)
│   └── .orkeon/       orkeon-cli.d.ts (generated: npm run typings)
├── crews/<name>/      crew.ork.ts (wiring) + application/ (run-<crew>.ts, the use case) + domain/
│   └── .orkeon/       orkeon.d.ts (generated)
└── shared/
    ├── domain/        pure: types, agent-policy/ (permission modes and catalogue, behaviour flags,
    │                  output styles, memory categories), compaction, config schema, session keys...
    ├── application/   ports.ts and the services over them: session-io, config-store,
    │                  session-state, json-file, attached-skills, permission-rules,
    │                  extra-tools, compaction/
    └── infrastructure/ globals.ts (the only access to the runtime globals)
        └── orkeon/    the adapters of the ports, tool-results.ts (field casing),
                       runtime-tools.ts (the tool inputs), wiring.ts
tests/
├── support/           the test doubles (Fake*), never imported by runtime code
├── architecture.test.ts, command-surface.test.ts, version.test.ts
└── commands-*.test.ts the command use cases of commands/_lib/, over the fakes
mcp/whisper/           the speech MCP server, Python run by uv: whisper_mcp.py, tests/, samples/, smoke.py
```

Domain and application tests sit next to their module (`*.test.ts`); the entry points hold no logic worth a unit
test and are covered by the bundle check and the runtime smoke.

## Ports and adapters

A port (`src/shared/application/ports.ts`) is named after what the application needs, not after the runtime call
that provides it. Its adapter is the only code that calls the runtime for it and the only code that reads the
runtime's results, whose field casing varies (`messages` or `Messages`): a port hands back plain values, except
the two calls that show a raw result on purpose (`MemoryStore.get`, `ToolCatalogue.call`).

| Port | What it is for | Adapter (`src/shared/infrastructure/orkeon/`) | Fake (`tests/support/`) |
|---|---|---|---|
| `Shell` | Shell commands in `/workspace` (`shell_command`) | `shell.ts` | `fake-shell.ts` |
| `Files` | Read, write and list by virtual path, the VFS mounts (`file_read`, `file_write`, `directory_read`, `list_mounts`) | `files.ts` | `fake-files.ts` |
| `Progress` | The host's progress line, best effort (`progress_report`) | `progress.ts` | `fake-progress.ts` |
| `SessionStore` | The conversation buffer, the state bag, the title, the snip, the token budget (`session_store`, `session_snip`, `token_budget`) | `session-store.ts` | `fake-session-store.ts` |
| `Telemetry` | The session's metadata, cost and statistics (`session_store`, `session_cost`, `session_stats`) | `telemetry.ts` | `fake-telemetry.ts` |
| `MemoryStore` | Typed memory: list, add, get, remove (`memory_store`) | `memory-store.ts` | `fake-memory-store.ts` |
| `ToolCatalogue` | The registered tools under their registered names, found case-insensitively as Orkeon finds them, for diagnostics and the extra tools' check (the `tools` service of `ctx.services` for the names, the `tools` namespace for the calls) | `tool-catalogue.ts` | `fake-tool-catalogue.ts` |
| `CodeIndex` | The code index as `/analyze` harvests it (`index_status`, `index_codebase`, `codebase_map`, `dependency_graph`, `package_summary`) | `code-index.ts` | `fake-code-index.ts` |
| `CrewHost` | List and launch crews (the `script-host` service, `ctx.services`) | `crew-host.ts` | `fake-crew-host.ts` |
| `PermissionRules` | The session rules of the host's permission gate: add, clear, list (the `permissions` service, `ctx.services`) | `permission-rules.ts` | `fake-permission-rules.ts` |
| `Llm` | The model: `act` (the tool loop), `complete`, `extract` (`ctx.llm` of the running agent); a failed `act` or `complete` throws an `LlmFailure` | `llm.ts` | `fake-llm.ts` |
| `RunState` | The running agent's own state, for one crew run (`ctx.state`) | `run-state.ts` | `fake-run-state.ts` |
| `CrewMemory` | The running crew's key/value memory, shared by its agents for one run (`ctx.memory.crew`) | `crew-memory.ts` | `fake-crew-memory.ts` |
| `Logger` | The command's or the crew's log | none: `ctx.log` is passed as is | `fake-logger.ts` |

**Wiring.** `wiring.ts` binds the adapters that read the `tools` global (`orkeonShell()`, `orkeonFiles()`,
`orkeonProgress()`, `orkeonTelemetry()`, `orkeonMemoryStore()`, `orkeonCodeIndex()`, `orkeonToolCalls()`, the calls
of a crew by a name its command found, and `orkeonToolCatalogue(ctx.services)`, which a handler builds, as the
registered names come from its context) and the
services built on them (`orkeonConfigStore()`, `orkeonSessionIo()`). The adapters of what the context carries
are built by the entry point from the context it receives: `createLlm(ctx.llm)`, `createRunState(ctx)`,
`createCrewMemory(ctx)`, `createCrewHost(ctx.services)` and `createPermissionRules(ctx.services)` (an async command
hands the last two to `launchCrew` or `launchMainLoop` with its log). Every adapter takes the runtime object as a
parameter, so its own test runs it over a stand-in: `fake-tools.ts` (the `tools` global), `fake-llm-facade.ts`
(`ctx.llm`), `fake-agent-context.ts` (`ctx.state`, `ctx.memory`), `fake-script-host.ts` (the script-host service),
`fake-permissions-facade.ts` (the permissions service).

**Services** (`src/shared/application/`) are built over the ports and shared by commands and crews: `session-io.ts`
(the buffer plus the permission mode a session runs in), `config-store.ts` (`/config`: the settings file overridden
by the state bag), `session-state.ts` (JSON values in the state bag), `json-file.ts` (JSON files, guarded against
invalid content), `attached-skills.ts` (the `/skills` registry with each file's content), `permission-rules.ts` (the
session's rules and their sync to the host gate), `extra-tools.ts` (the `tools.extra` setting against the registered
tools) and `compaction/` (the compaction pipeline).

## Entry points

**A command** parses its arguments, calls its use case with the adapters, and shows the view it gets back. The
use case lives in `commands/_lib/`, takes the ports it reads (a `Pick<>` of them) and returns a `CommandView`: a
table and a closing message. `/mode`:

```ts
/// <reference path="./.orkeon/orkeon-cli.d.ts" />
import { rawTokens } from "./_lib/args.ts";
import { runMode } from "./_lib/mode.ts";
import { showView } from "./_lib/view.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "mode",
  description: "Cycle, show or set the session-default permission mode of the assistant.",
  handler: async (args, ctx) => showView(ctx, await runMode(rawTokens(args), { session, log: ctx.log })),
});
```

A use case whose command writes its own output (`/diff`) puts it in the view's `lines`, written before the table and
the message. An async command starts a crew instead: `dispatch` returns
`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<crew>", input)` (the ticket, from
`_lib/dispatch.ts`) and `completed` prints the result with `writeCompleted`.

**A crew** builds its agents, wires the adapters at module scope, builds the context-bound ones in the agent body,
and calls its use case `application/run-<crew>.ts`, which takes its input and its ports. `/analyze`:

```ts
import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonCodeIndex, orkeonProgress } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runAnalyze } from "./application/run-analyze.ts";

const ports = { index: orkeonCodeIndex(), progress: orkeonProgress() };

const analyst = AgentBuilder()
  .name("analyst")
  .tools([])
  .body(async (_input: any, ctx: any) =>
    await runAnalyze(inputs(), { ...ports, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(CrewBuilder().name("analyze").process("sequential").withAgent(analyst).build());
```

## From a command to a crew

```text
/assistant fix the parser
  └─ assistant.cmd.ts         defineAsyncCommand: parses the "mode:" prefix; launchMainLoop resolves the
       │                      session's mode, checks tools.extra, hands the rules to the gate
       └─ script-host.runCrewAsync("main-loop", { prompt, permissionMode, permissionModeVia,
                                                  permissionRules, extraTools, prelude?, epilogue? })
            └─ /crews/main-loop/crew.ork.ts   (the first --crews-dir holding <name>/crew.ork.ts)
                 └─ agent .body(): one turn of the loop (below)
       ◀─ ticket; the REPL prints the result when the crew completes
```

- A **synchronous command** (`defineCommand`) answers at once: settings, session state, git views.
- An **async command** (`defineAsyncCommand`) starts a crew through the `script-host` service: `runCrewAsync` returns
  a ticket at once, `runCrew` waits (bounded). Crews are found by name under the directories given with
  `--crews-dir`; a name with `/`, `\` or `..` is refused.
- Commands and crews share code through relative imports (`src/shared`, a crew's `domain/`): the runtime bundles
  each entry point into one script before running it.

## Crews

| Crew | Process | Started by | What it does |
|---|---|---|---|
| `main-loop` | autonomous, budget 200 tool calls / 1800 s / 400k tokens | `/assistant`, free text, `/summary`, `/transcribe --then`, `/voice send` and `--go` | The interactive loop |
| `project-init` | sequential | `/init` | Scans the layout, detects conventions, writes the instructions file |
| `git-commit` | sequential | `/commit` | Drafts a conventional commit from the diff, commits after confirmation |
| `code-review` | sequential | `/review`, `/bughunter`, `/security-review` | Multi-lens review of the staged changes, ranked findings |
| `analyze` | sequential | `/analyze` | Index, maps, dependency graph, then a synthesis (`--raw` skips the LLM) |
| `session-compact` | sequential | `/compact`, automatic compaction | Saves durable facts to typed memory, snips, then summarises the buffer if still needed |
| `init-verifiers` | sequential | `/init-verifiers` | Detects test tooling, writes verification playbooks for uncovered zones |
| `advisor` | sequential, no tools | `/advisor` | A second opinion on the last answer from another model |
| `speech` | sequential, no tools, no LLM | `/transcribe`, `/voice`, `/say` | One call to the speech MCP server (`transcribe_audio`, `list_audio`, `record_and_transcribe`, `speak`), as the command's |

Folders starting with `_` (`_probe-budget`, `_probe-codeintel`, `_probe-raggable`) are development probes, run with
`scripts/run-crew.sh`.

## One turn of the loop

The `main-loop` agent's body is the loop (`crews/main-loop/application/run-main-loop.ts`):

1. Make the launching command's prelude call, if any (`/transcribe --then`: the transcription, which follows the
   request; `/voice --go`: the dictation, which is the request), as the command's call: a failure fails the run
   before anything is stored.
2. Take the mode the launching command resolved (an explicit `mode:` prefix, else the session default set by `/mode`,
   else the fallback; `default` when launched without one) and say where it came from.
3. Build the tool catalogue from the mode, the extra tools and the rules (at load time) and announce what the rules
   changed.
4. Read the behaviour flags once (`/effort`, `/passes`, `/fast`, `/proactive`, `/output-style`).
5. Append the user turn to the session buffer; compact first if the buffer is under pressure
   (`auto-compact.ts`).
6. Assemble the prompt (below; `turn-prompt.ts` over the reads of `context-gather.ts`) and call the model's `act`
   (the `Llm` port over `ctx.llm.act()`): the runtime runs the model ⇄ tool calls cycle over the catalogue, every
   call of a model turn in order, under the crew budget and the permission gate, and returns the final answer. A
   failed model call throws an `LlmFailure`: the turn stores no answer and fails with the provider's error.
7. Append the answer; make the epilogue call, if any (`voice.reply on`: `speak` with the answer), a failure being a
   warning; compact again if the turn left the buffer saturated.

The session lives in the runtime: a conversation buffer (`session_store`, `session_snip`, `token_budget`), a state
bag (`get_state`/`set_state`), typed memory (`memory_store`: user, project, feedback, reference) and cost and usage
(`session_cost`, `session_stats`).

## Prompt assembly

`crews/main-loop/domain/prompt-assembly.ts` builds two things.

**The static header**, sent as the system message: identity, tool policy, the behaviour blocks and the search
playbook. It holds no number and no per-turn data, so its bytes stay identical from turn to turn and providers can
cache it.

**The user body**, in a fixed order: session preferences, attached skills, memory, declared hooks, project context
(the instructions file), the history window, the context gauge, then the request with its permission note, always
last.

The behaviour blocks must produce the following behaviour. This is the specification the blocks are written from,
in this project's own words (see CONTRIBUTING, "Original work only"):

- **Reporting**: the user sees the final message only, not the tool calls; that message carries every result. It
  opens with the outcome, uses full sentences and the terms the reader knows, keeps its format proportionate to the
  question, points at code as `path:line`, and shows file listings as trees.
- **Scope**: a request is a software task on the mounted project. Do what was asked: no speculative features,
  abstractions or defensive code for impossible cases; validate at the boundaries; remove dead code entirely; write no
  vulnerable code; comment only what the code cannot say.
- **Finishing**: act once the facts are known; recommend rather than list options; answer a question with an
  assessment and change nothing unless asked; never end a turn on a plan or a promise that tool calls could fulfil;
  check the evidence before any state-changing command.
- **Refusals**: a missing tool or a refused call is a decision of the mode or the user; change approach instead of
  repeating the call.
- **Search**: route by file type to the right index, prefer the code-intelligence tools to the shell, trust their
  freshness (edited files are reindexed before a search answers).

## Context management

- **Automatic compaction** at the head and the tail of each turn when the buffer crosses its threshold, behind a
  circuit breaker kept in the session state so a failing compaction does not loop.
- **`/compact`** snips first (head plus the last exchanges) and summarises only when that is not enough; the summary
  keeps a fixed set of sections and moves durable facts into typed memory.
- **File restore** re-reads, after a compaction, the files the conversation was working on, and the attached skills.
- **Pressure tiers** (`/usage`, `/context`) tell the user and the prompt how full the window is.

Both compactions run the same pipeline, `shared/application/compaction/compact-session.ts` (`compactSession`), over
the ports its entry point wires; `restore-context.ts` and `extract-memories.ts` hold the restoration and the memory
extraction, `shared/domain/compaction.ts` the prompts and buffers, `shared/domain/compact-outcome.ts` the outcome.

## Recipes

### Add a command

1. Write `src/commands/<name>.cmd.ts` after the pattern above: one `name: "<literal>"` in kebab case, a static
   `description`, no top-level `export`.
2. Put the logic worth testing in `src/commands/_lib/<family>.ts` as `run<Name>(tokens, deps)` returning a
   `CommandView`, its deps a `Pick<>` of the ports and services it reads; test it in
   `tests/commands-<family>.test.ts` over the fakes.
3. Raise `EXPECTED_COMMAND_COUNT` in `tests/command-surface.test.ts` and the command count of `RELEASE_NOTES` in
   `src/commands/_lib/meta.ts` (pinned by `tests/commands-meta.test.ts`), then run `npm run docs:commands`.

### Add a crew

1. Create `src/crews/<name>/crew.ork.ts` after the pattern above: the two header lines (`// @orkeon-script 1.0`, then
   the reference to `../.orkeon/orkeon.d.ts`), the agents with the tool names they need, `publishCrew(...)`.
2. Put the use case in `application/run-<name>.ts` (`run<Name>(input, deps)`), its pure rules in `domain/`, each with
   its `*.test.ts`; the use case test runs over the fakes.
3. Start it from an async command (`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<name>",
   input)`), and name it in `RELEASE_NOTES`
   (`tests/commands-meta.test.ts` checks that every crew folder is named there). A folder starting with `_` is a
   development probe (`probe.ork.ts`), never listed to users.

### Add a tool

1. Check the name the runtime registers (`/debug-tool-call list`): an unknown name in `.tools([...])` fails every
   `act` call of the agent. A tool of an MCP server or a plugin needs no code: the user lists it in `tools.extra`
   (`shared/domain/agent-policy/extra-tools.ts`), and the launching command offers it if the host registers it.
2. For the main loop, add it to its class in `src/shared/domain/agent-policy/permission.ts` (`READ_TOOLS`,
   `NETWORK_READ_TOOLS`, or the edit and shell classes): the mode-policy table decides which modes hand it to the
   model. Update `permission.test.ts`, and `docs/permissions.md` when a mode's surface changes. Another crew names
   it in its own `.tools([...])`.
3. When application code calls the tool itself, it goes through a port: declare its input in
   `orkeon/runtime-tools.ts` (`CalledTools`), add the call to an adapter (or a new port, below) that reads the result
   through `tool-results.ts`, test the adapter over `FakeTools`.

### Add a permission mode

A mode is stated once: an entry of `PERMISSION_MODES` (`src/shared/domain/permission-modes.ts`, and `MODE_CYCLE`
when bare `/mode` should cycle through it) and a row of `MODE_POLICIES`
(`src/shared/domain/agent-policy/mode-policy.ts`):

| Mode | `readOnly` | `toolClasses` |
|---|---|---|
| `default` | no | read, network, edit, shell, extra |
| `acceptEdits` | no | read, network, edit, shell, extra |
| `bypassPermissions` | no | read, network, edit, shell, extra |
| `plan` | yes | read |
| `dontAsk` | yes | read |

`extra` is the extra tools of class `write`; an extra tool of class `read` joins `read`. `MODE_POLICIES` is typed by
the mode list, so the type check refuses a mode without its row. The main-loop
catalogue and its permission note, the refusal of `/commit` in a read-only mode and `/mode`'s announcement read the
row; `/mode` and the allowed values of `permissions.fallback` read the list. The host's permission gate must know
the mode too (Orkeon classifies an unknown mode fail-closed). Update `mode-policy.test.ts` and
`docs/permissions.md`.

### Add a prompt block

1. Write its renderer in `src/crews/main-loop/domain/prompt-assembly.ts` (`build<Name>Block`), returning an empty
   string when there is nothing to say, so a session that does not use it keeps a byte-identical prompt.
2. Give it a field of `PromptParts` and its place in `assemblePrompt`'s fixed order; a block of the static header
   must hold no per-turn data, or the provider's cache breaks.
3. Read its input in `application/context-gather.ts` (through the ports) and pass it in `application/turn-prompt.ts`;
   test the renderer in `prompt-assembly.test.ts` and the turn over the fakes.
4. Write the text in this project's own words (CONTRIBUTING, "Original work only").

### Add a config key

1. Declare it in `CONFIG_KEYS` (`src/shared/domain/config-schema.ts`): key, description, allowed values, the
   consumer. A key nothing reads must not be settable.
2. The consumer takes `Pick<ConfigStore, "readValue">` as a dependency (wired with `orkeonConfigStore()`) and reads
   `(await config.readValue(key)).value`, falling back to its default when the value is absent or unreadable.
3. `/config keys` lists it with its allowed values and the commands that read it, and `/config get` shows its
   description while it is unset; name it in `docs/configuration.md` ("Session settings") when users should know it.

### Add a port

1. Declare the interface in `src/shared/application/ports.ts`, named after the need, with its failure contract
   (which calls throw, which are best effort).
2. Write the adapter `src/shared/infrastructure/orkeon/<port>.ts`: `create<Port>(runtimeObject)`, the tool inputs
   declared in `runtime-tools.ts`, the results read through `tool-results.ts`. Bind it in `wiring.ts` when it reads
   the `tools` global; otherwise the entry point builds it from its context.
3. Write `tests/support/fake-<port>.ts`, a class `Fake<Port>` implementing the port with plain fields to configure
   and inspect, and the adapter's test over the runtime stand-in.
4. A port lands with its first production caller, never ahead of it.

## Known remainders

- The probes `_probe-codeintel` and `_probe-raggable` reach `globalThis` directly rather than through `globals.ts`.
  They are development tools and crew entry points, which the architecture test lets read the runtime globals.
