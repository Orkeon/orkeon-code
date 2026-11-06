# Architecture

Orkeon Code is the TypeScript half of a coding agent; the [Orkeon](https://github.com/Orkeon/orkeon) runtime is the
other half. This page describes how the two meet, the constraints the runtime sets, the layers of the sources and
the rule between them, how a request travels, and how to extend the code. The reasons for the layering are recorded
in [ADR 0001](adr/0001-clean-architecture.md).

## Two halves

| This repository (TypeScript) | The Orkeon runtime (.NET, pinned to a commit of its `main` in `.orkeon-version`) |
|---|---|
| Slash commands (`src/commands/<group>/*.cmd.ts`) | The scripted-commands REPL that loads them (`orkeon-repl --runner=scripted-commands`) |
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
  (`tools`, `agentBuilder`, `crewBuilder`, `toolBuilder`, `rag`, `inputs`) and the context it hands each command
  handler and agent body (`ctx`: `llm`, `log`, `state`, `services`...).
- **No shared instance.** Nothing lives across bundles: a module-level object exists once per bundle and per run. A
  registry, a container or a cache shared by the commands and the crews cannot exist.
- **The session state bag is the only shared state.** Commands, crews and turns share what the session holds: the
  conversation buffer and the state bag (`session_store`), cleared by `/clear`. The settings file
  (`/workspace/.orkeon/config.json`) is the durable store. Typed memory lasts as long as the runtime keeps it: per
  project in a file when `Orkeon:Cli:Memory:Persist` is on (the REPL's default, and the example settings'), so it
  reaches a later run; otherwise in the Orkeon process, which it dies with (Orkeon #286).
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
- **The host's gate runs first.** An `onToolCall` hook sees only the calls the gate allowed; an `"ask"` it returns is
  checked again as an edit in the `default` mode.
- **The read calls of a turn run together.** `Orkeon:Tools:ResultLimits:MaxParallelToolCalls` (4) read calls of one
  model turn run at once; every other call runs alone, one after the other.
- **`spawn_agent` is the host's own.** The script host offers it to every act; naming it in `.tools([...])`, or in
  `act({ tools })`, throws `UnknownToolError`.

So each entry point is its own composition root: it builds the adapters it needs and hands them to a use case that
takes its dependencies as parameters. The ports are interfaces, erased from every bundle, and a test imports a use
case in Node without touching a runtime global.

## Layers and the dependency rule

| Layer | Where | Holds | Imports |
|---|---|---|---|
| domain | `src/shared/domain/`, `src/crews/<name>/domain/` | Pure types and functions: rules, prompt text, parsing, rendering | domain only |
| application | `src/shared/application/`, `src/crews/<name>/application/` | Use cases and services over the ports (`ports.ts`, re-exporting `ports/<concern>.ts`) | domain, application |
| infrastructure | `src/shared/infrastructure/` | `globals.ts`, the Orkeon adapters of the ports, `wiring.ts` | anything inward |
| command use cases | `src/commands/_lib/` | The use cases in a folder per command family (`dev/`, `git/`, `settings/`...), `run<Name>(tokens, deps)` → a view over the ports it is handed; at the root, the helpers the families share | anything but `shared/infrastructure/` |
| entry points | `src/commands/<group>/*.cmd.ts`, `src/crews/<name>/crew.ork.ts` | Parse the input, wire the adapters, call a use case, render | anything |

`tests/repository/architecture.test.ts` parses every import of `src/` and of the tests that mirror it under `tests/`
(static, re-export, type-only and dynamic) and fails on any import that breaks one of these rules; there is no
exception list. A test of the mirror is judged where its module stands: `tests/<path>/<m>.test.ts` keeps the layer
and the `commands/_lib/` group of `src/<path>/<m>.ts`, so a test of a domain module is a domain test. The rules:

- a file under `domain/` imports domain files only;
- a file under `application/` imports domain and application files only (its tests may import `tests/` besides):
  an allow-list, so a file in no layer is refused as `infrastructure/` is;
- a file under `domain/` or `application/` never imports `commands/` nor an entry point (`*.cmd.ts`, `crew.ork.ts`,
  `probe.ork.ts`);
- only `shared/infrastructure/` and the crew entry points (`crew.ork.ts`, `probe.ork.ts`, which need the builders and
  `inputs()`) import `globals.ts`: a command reaches the runtime through the adapters of `orkeon/wiring.ts`;
- `commands/_lib/` never imports `shared/infrastructure/`: the entry point builds the adapters and hands them over,
  so a test imports the use cases over the fakes;
- a `*.cmd.ts` never imports `crews/*/domain` nor `crews/*/application`: what it runs of a crew goes through a use
  case of `commands/_lib/`;
- a use case of `commands/_lib/<group>/` imports its own group or the root of `_lib/` only, and a `*.cmd.ts` calls
  the group of its own folder;
- `ports.ts` re-exports every file of `application/ports/`, and every name it exports;
- a relative import names its `.ts` file, and runtime code imports nothing but relative files (tests may import
  `node:` built-ins);
- runtime code never imports `tests/`: the test doubles are never bundled;
- a shared check of `tests/support/assertions/` imports `node:` built-ins only, so a test of any layer, a domain
  test included, may import it;
- no import cycle between files;
- a `<module>[.<facet>].fixtures.ts` or `.assertions.ts` is imported by the files of its module only (same folder,
  the name up to the first dot): what several modules share goes under `tests/support/`.

The same test reads the runtime globals with TypeScript's own scoping, file by file: an identifier its file does not
declare, import or bind, a `globalThis.<name>`, and an ambient re-declaration (`declare const tools`) are uses of a
global. `src/crews/.orkeon/orkeon.d.ts` declares the runtime's globals for every file, so the type check alone would
let any module call `tools.shellCommand(...)`:

- no `require()`: the sources are ES modules bundled by esbuild;
- only `shared/infrastructure/` and the crew entry points read `tools`, `agentBuilder`, `crewBuilder`, `toolBuilder`,
  `rag` and `inputs`;
- only a `*.cmd.ts` calls `defineCommand` or `defineAsyncCommand`: a toggle command registers the descriptor that
  `_lib/settings/session-config.ts` builds (`defineCommand(toggleCommand(spec, session))`).

It places every file and every read of the clock too: a runtime file of `src/` sits in a layer folder, or is an
entry point, a command use case of `commands/_lib/` or a declaration (`.d.ts`); a read of the clock (`new Date()`
with no argument, `Date()`, `Date.now()`) sits in `shared/infrastructure/`, and the rest of `src/` takes the `Clock`
port.

```text
src/
├── commands/          49 *.cmd.ts (parse, wire, render) in eight functional folders: session, settings, status,
│   │                  project, git, dev, memory, speech
│   ├── _lib/          the use cases, in the folder of their commands: run<Name>(tokens, deps) → CommandView,
│   │                  or dispatch<Name>(tokens, deps) → a ticket or a message when the command launches a
│   │                  crew, and their pure helpers. dev/ (dev, dev-batches, dev-implement, dev-source),
│   │                  git/ (branch, commit, diff, review), memory/ (memory, memory-admit), session/ (export,
│   │                  resume, tasks), settings/ (advisor, agents, config, hooks, mode, model, permissions,
│   │                  session-config: the toggle commands, skills), speech/ (say, transcribe, voice),
│   │                  status/ (cache, doctor, meta: version and release notes, status). At the root, what
│   │                  several families share: args.ts (arguments), dispatch.ts (crew launch, completion
│   │                  line, main-loop launch), dev-step.ts, effort.ts, pr-context.ts, view.ts (CommandView,
│   │                  showView)
│   └── .orkeon/       orkeon-cli.d.ts (generated: npm run typings)
├── crews/<name>/      crew.ork.ts (wiring) + application/ (run-<crew>.ts, the use case) + domain/
│   └── .orkeon/       orkeon.d.ts (generated)
└── shared/
    ├── domain/        pure: types, agent-policy/ (permission modes and catalogue, rule sets, behaviour flags,
    │                  output styles, memory categories), dev/ (repository pack, work folder, harness
    │                  formats), agents/ (sub-agent charters), shared-memory/ (memory entries, verdict
    │                  rows, refused motifs), compaction, config schema, session keys...
    ├── application/   ports/ (one file of ports per concern: shell, files, session, llm...),
    │                  ports.ts (re-exports them), and the services over them: session-io,
    │                  config-store, session-state, json-file, attached-skills, permission-rules,
    │                  extra-tools, compaction/, dev/, agents/
    └── infrastructure/ globals.ts (the only access to the runtime globals)
        └── orkeon/    the adapters of the ports, tool-results.ts (field casing),
                       runtime-tools.ts (the tool inputs), wiring.ts
tests/
├── crews/             the tests of src/, mirroring it: src/<path>/<m>.ts is tested by tests/<path>/<m>.test.ts,
├── shared/            its <m>.fixtures.ts and <m>.assertions.ts beside it; src/ holds runtime code only
├── commands/
├── support/           what several test files share, never imported by runtime code:
│   ├── doubles/       the test doubles (Fake*), one per port
│   ├── fixtures/      the sample data shared across test files (prompt-catalogue, memory-entries)
│   └── assertions/    the checks shared across test files
├── fixtures/          the texts that are files of their own (a sheet, a plan, a YAML)
├── repository/        the rules of the repository as a whole: architecture, test-shape, command-surface,
│                      prompt-contract, version, shared-memory-fixture
├── scripts/           the scripts of scripts/ and the launchers: dev-run, session-start-script, docs-parity,
│                      install, launcher
└── config/            the example settings
mcp/whisper/           the speech MCP server, Python run by uv: whisper_mcp.py, tests/, samples/, smoke.py
```

The tests of `src/` mirror it under `tests/`: `src/<path>/<m>.ts` is tested by `tests/<path>/<m>.test.ts`, its
`.fixtures.ts` and `.assertions.ts` beside the test; the entry points hold no logic worth a unit test and are covered
by the bundle check and the runtime smoke. `tests/repository/test-shape.test.ts` holds every
test to its shape, read from the syntax tree:

- each test is laid out Arrange, Act, Assert, one act per test;
- test code reads no clock and starts no timer (`setTimeout`, `setInterval`, `setImmediate`): it takes a `FakeClock`, but in
  `tests/scripts/`, which drives real processes;
- a double lives in `tests/support/doubles/` and nowhere else: no class that extends a `Fake…` or implements a port
  (the ports are read from the exports of `ports/`), no object literal typed as a port, no method of a fake
  replaced on an instance; what a fake cannot play yet is a new field of that fake;
- `src/` holds no test, fixtures nor assertions file, and every one of the mirror has its `<module>.ts` at the same
  path in `src/`, a second test file of the module being `<module>.<facet>.test.ts`.

## Ports and adapters

A port (`src/shared/application/ports/<concern>.ts`, re-exported by `ports.ts`) is named after what the application needs, not after the runtime call
that provides it. Its adapter is the only code that calls the runtime for it and the only code that reads the
runtime's results, whose field casing varies (`messages` or `Messages`): a port hands back plain values, except
the two calls that show a raw result on purpose (`MemoryStore.get`, `ToolCatalogue.call`). A caller that reads a
tool's text uses `ToolCatalogue.callText` instead: the adapter decodes the result (`tool-results.ts`) and hands back
the text, or the tool's own failure message without the runtime's wrapping, and never throws.

| Port | What it is for | Adapter (`src/shared/infrastructure/orkeon/`) | Fake (`tests/support/doubles/`) |
|---|---|---|---|
| `Shell` | Shell commands in `/workspace` (`shell_command`) | `shell.ts` | `fake-shell.ts` |
| `ShellJobs` | A long command run detached, its status, the tail of its log, and a wait between two looks (`shell_command` `start_job`, `job_status`, `job_tail`) | `shell-jobs.ts` | `fake-shell-jobs.ts` |
| `SharedMemory` | The RAG index of the [shared memory](shared-memory.md): search a collection, ingest with prune (the `rag` namespace, else `rag_search`, `rag_ingest`) | `shared-memory.ts` | `fake-shared-memory.ts` |
| `ChildRuntime` | The children of a crew run: spawn one in the background, list, stop, read what it left (`ctx.spawnBackground`, the crew's `instances()`/`stop()`, its memory) | `child-agents.ts` | `fake-child-runtime.ts` |
| `HumanInput` | A question to the person: a choice, a text, a multi-select; nobody answering is an answer of its own (`human_input`) | `human-input.ts` | `fake-human-input.ts` |
| `Files` | Read, write and list by virtual path, the VFS mounts (`file_read`, `file_write`, `directory_read`, `list_mounts`) | `files.ts` | `fake-files.ts` |
| `Progress` | The host's progress line, best effort (`progress_report`) | `progress.ts` | `fake-progress.ts` |
| `SessionStore` | The conversation buffer, the state bag, the title, the snip, the token budget by kind (`session_store`, `session_snip`, `token_budget`) | `session-store.ts` | `fake-session-store.ts` |
| `SessionSwitch` | The session saved now, a saved one loaded in place (the `session` service, Orkeon #227) | `session-switch.ts` | `fake-session-switch.ts` |
| `RuntimeInfoReader` | The runtime that runs the command: version, commit, channel (the `runtime` service, Orkeon #225) | `runtime-info.ts` | `fake-runtime-info.ts` |
| `UsageReader` | The session's LLM usage, in total, by model and by command (the `usage` service, Orkeon #226) | `usage.ts` | `fake-usage-reader.ts` |
| `Telemetry` | The session's metadata, cost and statistics (`session_store`, `session_cost`, `session_stats`) | `telemetry.ts` | `fake-telemetry.ts` |
| `MemoryStore` | Typed memory: list, add, get, remove, replace in place (`memory_store`) | `memory-store.ts` | `fake-memory-store.ts` |
| `ToolCatalogue` | The registered tools under their registered names, found case-insensitively as Orkeon finds them, for diagnostics and the extra tools' check (the `tools` service of `ctx.services` for the names, the `tools` namespace for the calls: `call` raw, `callText` decoded) | `tool-catalogue.ts` | `fake-tool-catalogue.ts` |
| `CodeIndex` | The code index as `/analyze` harvests it and `/init` reads its package map (`index_status`, `index_codebase`, `codebase_map`, `dependency_graph`, `package_summary`) | `code-index.ts` | `fake-code-index.ts` |
| `CostIndex` | The access cost `/dev-batches` measures: the indexed roots, the refresh of the batch's files, the report (`index_status`, `incremental_reindex`, `access_cost`) | `code-index.ts` | `fake-cost-index.ts` |
| `CrewHost` | List and launch crews (the `script-host` service, `ctx.services`) | `crew-host.ts` | `fake-crew-host.ts` |
| `PermissionRules` | The session rules of the host's permission gate: add, clear, list (the `permissions` service, `ctx.services`) | `permission-rules.ts` | `fake-permission-rules.ts` |
| `Llm` | The model: `act` (the tool loop), `complete`, `extract` (`ctx.llm` of the running agent); a failed `act` or `complete` throws an `LlmFailure` | `llm.ts` | `fake-llm.ts` |
| `RunState` | The running agent's own state, for one crew run (`ctx.state`) | `run-state.ts` | `fake-run-state.ts` |
| `CrewMemory` | The running crew's key/value memory, shared by its agents for one run (`ctx.memory.crew`) | `crew-memory.ts` | `fake-crew-memory.ts` |
| `Clock` | The current time (`ports/clock.ts`), the one read of the clock outside `shared/infrastructure/` | `wiring.ts` (`orkeonClock()`) | `fake-clock.ts` |
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
`orkeonClock()` is the clock of the runtime code: an entry point hands it to what dates a record or measures a
wait, where a test hands a `FakeClock`.
`orkeonCompactionDeps(ctx, ports, clock)` gathers the ports of the compaction pipeline, for `/compact` and the main
loop's automatic compaction alike.

**Services** (`src/shared/application/`) are built over the ports and shared by commands and crews: `session-io.ts`
(the buffer plus the permission mode a session runs in), `config-store.ts` (`/config`: the settings file overridden
by the state bag), `session-state.ts` (JSON values in the state bag), `json-file.ts` (JSON files, guarded against
invalid content), `attached-skills.ts` (the `/skills` registry with each file's content), `permission-rules.ts` (the
session's rules and their sync to the host gate), `extra-tools.ts` (the `tools.extra` setting against the registered
tools) and `compaction/` (the compaction pipeline).

**Rule sets** (`src/shared/domain/agent-policy/rule-sets.ts`) are deny rules Orkeon Code ships as data, in the
`/permissions` syntax: `git-readonly`, `inline-interpreters`, `read-noise`, `secrets`, `state-files`.
`src/shared/domain/dev/step-rules.ts` says which dev step holds which sets. The step's command checks that the host's
gate is on, then `syncStepRules` (`permission-rules.ts`) hands the gate the session's rules followed by the step's,
without storing the step's. The next `/assistant` turn hands it the session's rules alone. The pure `matchesRule`
beside the rule parser mirrors how the gate reads a rule. It is used by the tests, and later by the tools Orkeon Code
wraps around a built-in, whose own calls the gate does not see.

## Entry points

**A command** parses its arguments, calls its use case with the adapters, and shows the view it gets back. The
use case lives in `commands/_lib/`, takes the ports it reads (a `Pick<>` of them) and returns a `CommandView`: a
table and a closing message. `/mode`:

```ts
/// <reference path="../.orkeon/orkeon-cli.d.ts" />
import { rawTokens } from "../_lib/args.ts";
import { runMode } from "../_lib/settings/mode.ts";
import { showView } from "../_lib/view.ts";
import { orkeonChooser, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "mode",
  description: "Choose, show or set the session-default permission mode of the assistant.",
  handler: async (args, ctx) =>
    showView(ctx, await runMode(rawTokens(args), { session, log: ctx.log, chooser: orkeonChooser(ctx) })),
});
```

A use case whose command writes its own output (`/diff`) puts it in the view's `lines` and, for a unified diff, in its
`diff`, a typed block the console colours: both are written before the table and the message. A command that offers a
choice takes the `Chooser` port: without an argument, in an interactive console, it opens a panel (`/model`, `/effort`,
`/output-style`, `/mode`, `/theme`), and on a replay or a plain console it keeps its text behaviour. An async command starts a crew instead: `dispatch` returns
`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<crew>", input)` (the ticket, from
`_lib/dispatch.ts`) and `completed` prints the result with `writeCompleted`, as a markdown block the console renders, a failure as a plain
line.

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
| `main-loop` | autonomous, budget 200 tool calls / 1800 s / 700k context tokens (the context counted once, Orkeon #224) | `/assistant`, free text, `/summary`, `/verify`, `/transcribe --then`, `/voice send` and `--go` | The interactive loop |
| `project-init` | sequential, no tools (the index read through the `CodeIndex` port) | `/init` | Scans the layout, detects conventions, reads the package map when an index exists, writes the instructions file (a proposal beside it when an existing file was cut) |
| `git-commit` | sequential | `/commit` | Drafts a conventional commit from the diff, commits after confirmation |
| `code-review` | sequential | `/review` (`--lens` for one lens, `--passes` for this run's rounds; the aliases `/security-review` and `/passes`) | Multi-lens review of the staged changes, ranked findings |
| `analyze` | sequential | `/analyze` | Index, package map, module graph, every package read for its dependencies and entry modules (a package only its tests depend on still starts the rest), the entry packages and the largest summarized, then a synthesis (`--raw` skips the LLM) |
| `session-compact` | sequential | `/compact` (`--snip` to truncate only), automatic compaction | Saves lasting facts to typed memory, then summarises the whole buffer in its place; `--snip`, or a summary that fails, only cuts to the last whole turns, with a marker |
| `init-verifiers` | sequential, no tools | `/init-verifiers` | Detects test tooling from every manifest, writes verification playbooks for uncovered zones |
| `advisor` | sequential, no tools | `/advisor` | A second opinion on the last answer from another model |
| `speech` | sequential, no tools, no LLM | `/transcribe`, `/voice`, `/say` | One call to the speech MCP server (`transcribe_audio`, `list_audio`, `record_and_transcribe`, `speak`), as the command's |
| `dev-verify` | sequential, the gate and capture in `dev-verifier`, the audit in a background child `dev-auditor` (seven read tools in `plan`, `run_validation`, `memory_recall`) | `/dev-batches <code> F<n> --audit` (`--gate-only` skips the LLM) | The gate, the capture, one read-only audit, the verdict file |
| `dev-learn` | sequential, no tool, one extract per axis | `/dev-learn` (`--list` skips the LLM) | Recurring verdict gaps into proposals, `PROPOSALS.md` |
| `dev-plan` | sequential, one extract in `dev-planner`, the review in a background child `dev-reviewer` (ten read tools in `plan`) | `/dev-plan` | Blocking gate, inventory by the index, plan and sheets written by code, one read-only review |
| `agent-run` | sequential, one act of a built-in charter (`dev-reviewer`, `dev-auditor`) | `/tasks send`, `/tasks repair` | A new run of an ended child, its brief carrying the previous report and the operator's message; it runs under the step of the instance's run (a reviewer of `/dev-spec` under that step's rule sets, hooks and budget), else the charter's step, with that step's budget and no child of its own |
| `dev-spec` | sequential, extracts, the review in a background child `dev-reviewer` (ten read tools in `plan`; inline on a host without background children) | `/dev-spec` | Business spec written by code from JSON, its questions asked one at a time through `human_input`, one read-only review |
| `dev-change` | sequential, extracts, the review in a background child `dev-reviewer` (ten read tools in `plan`; inline on a host without background children) | `/dev-spec <code> <kind>` | Bug reproduced or cost measured by running, change brief written by code, questions through `human_input`, one review |
| `dev-implement` | sequential, one agent, two roles in `acceptEdits` (five read tools, six write tools - `file_write` for a new file, the node editors and `edit_batch` for an existing one; the editing rule spells an `edit_batch` out, its `operations` list and `validate`, and the guard's refusal of a batch without operations repeats it; the runtime publishes the schema of the node tools too since Orkeon #210; every `node_replace` of a batch carries the hash `node_read` gave for that very node, never a guessed one, since a placeholder hash made the runtime refuse a whole batch in a live run - `run_tests`, `run_build`, `memory_recall`) | `/dev-batches <code> F<n>` (`--close` the close alone) | Each cycle (the steps on one test file) red then green, checked by code, its cost measured; a correction appended as a step; the build and the suite (later the affected projects) as jobs; then the audit (the `dev-verify` crew) and, on VALID, the commit and the done marks; an assumption is recorded once per batch, never one the sheet already holds; a relative path a role hands a tool is resolved under the checkout before the tool runs |
| `dev-batches` | sequential, one agent with the reviewer's read tools, its review inline (the next batch's review is offered five of them, `file_read`, `node_outline`, `node_read`, `codebase_search` and `glob`, for eight turns: its brief carries the sheet, what the closed batches changed and the plan); with `--concurrency` 2 to 4, one batch agent per batch of a wave (`batch-F<n>`, the implement tools and the auditor's read tools, `run_tests`, `run_build`, `run_validation`, `memory_recall`), each under its worktree's working root | `/dev-batches` (typed again after a stop: the run goes on; every hop of its chain keeps the depth of the instance it runs for, `chain: "continue"`, so a plan of any length closes in one command, Orkeon #221) | Names a plan's next batch in its dependencies' order, after a review of its sheet once its dependencies closed; logs each batch in `batches-state.md`; sequential, the command's `completed` drives `/dev-batches`, each close committed without a push; in parallel, the driver seeds each worktree, runs the wave's batch agents at once (each runs the steps, the audit inline and the close in code, bounded by its own tool calls), then merges each VALID batch fast-forward in id order, brings its files back and removes its worktree; one push and one pull request at the plan's close; a review that cannot run (no reviewer on the host, an answer that does not parse twice, a refused call) stops the batch before its launch, logged `BLOCKED — review not run (<reason>)`, and the next run reviews it again (a stop for Blocking questions is settled by the human and not reviewed twice); each Major row of the review ends the RED and GREEN prompts of that batch as a `stale: <question> — <evidence>` line, on its first launch only; a GAPS verdict relaunches the batch by itself, in its worktree in parallel, its Blocking and Major rows as the correction (none for an audit the budget stopped, whose resume then runs), up to three audit rounds in GAPS since the last VALID, an audit the budget stopped counted as one; the third still GAPS goes to a human |
| `shared-memory-admit` | sequential, no tool, no LLM | `/memory admit` | Writes the candidates the operator confirmed to the shared memory's entries, the lists, and re-ingests the index |

A folder starting with `_` holds a development probe (`probe.ork.ts`), never a command's crew: `_probe-shared-memory`
measures the shared memory's recall on a reference set, run by `scripts/check-shared-memory.sh` before a release.

## One turn of the loop

The `main-loop` agent's body is the loop (`crews/main-loop/application/run-main-loop.ts`):

1. Make the launching command's prelude call, if any (`/transcribe --then`: the transcription, which follows the
   request; `/voice --go`: the dictation, which is the request), as the command's call: a failure fails the run
   before anything is stored.
2. Take the mode the launching command resolved (an explicit `mode:` prefix, else the session default set by `/mode`,
   else the fallback; `default` when launched without one) and say where it came from.
3. Build the tool catalogue from the mode, the extra tools and the rules (at load time) and announce what the rules
   changed.
4. Read the behaviour flags once (`/effort`, `/passes` of `/review`, `/fast`, `/proactive`, `/output-style`).
5. Append the user turn to the session buffer; compact first if the buffer is under pressure
   (`auto-compact.ts`).
6. Assemble the prompt (below; `turn-prompt.ts` over the reads of `context-gather.ts`) and call the model's `act`
   (the `Llm` port over `ctx.llm.act()`): the runtime runs the model ⇄ tool calls cycle over the catalogue, every
   call of a model turn in order, under the crew budget and the permission gate, and returns the final answer. A
   failed model call throws an `LlmFailure`: the turn stores no answer and fails with the provider's error. A call a
   decision stage of the host blocked is no outage but a decision: the runtime rejects it with a typed
   `DecisionBlockedError` (Orkeon #269), which `decisionBlockOf` (`shared/domain/llm-failure.ts`) reads: the turn stores nothing after the request but the `[tools]` message of the calls
   that ran before the block (an edit made on disk stays on record), logs a warning and answers the block, its profile, stage and reason, with what to do; the run does not fail.
7. Append the turn's `[tools]` message, then the answer. The message is built from the act's `onToolResult`
   (`shared/domain/tool-trace.ts`) and from the calls the crew's own `onToolCall` denied (an error `denied: <reason>`):
   one line per call, the tool, its main arguments cut short (path, pattern, glob,
   mode, command…) and a one-line outcome (a count, an exit code, an error, a cut scan); repeated calls folded as
   `×n`, at most twenty lines, the last one counting the calls left out, never a file's content nor a command's
   output. A call the host's permission gate refused reaches neither callback and is not traced. A turn that called
   no tool stores none. `/usage tools [text]` lists these messages under their requests. Then make the epilogue call, if any (`voice.reply on`: `speak` with the answer), a failure being a
   warning; compact again if the turn left the buffer saturated.

The session lives in the runtime: a conversation buffer (`session_store`, `session_snip`, `token_budget`), a state
bag (`get_state`/`set_state`), typed memory (`memory_store`: user, project, feedback, reference; kept per project in
a file when `Orkeon:Cli:Memory:Persist` is on, Orkeon #286) and cost and usage (`session_cost`, `session_stats`).

A turn reads the state keys it needs in one `get_state` call at its start (`TURN_STATE_KEYS` in `run-main-loop.ts`,
answered by `shared/application/state-snapshot.ts`: a key outside the list is read alone), and stores each message
with `append_message`, which neither returns nor rewrites the buffer (Orkeon #263). On a release before #263 (the
tool and docker modes), where both calls throw, each key is read alone and the message is added by reading and
rewriting the buffer (`orkeon/session-store.ts`). The turn reads the buffer once, for its history: its automatic
compactions, at the head and the tail, read the token budget first and the buffer only past the trigger
(`compactSession`), and the trigger setting is read once per turn (`crew.ork.ts`).

## Prompt assembly

`crews/main-loop/domain/prompt-assembly.ts` builds the three messages of each turn.

**The static header**, sent as the system message: the behaviour rules, the tool list with what the tools can and
cannot do, the search playbook when the search tools are offered, and the project's instructions file. It holds no
number and no per-turn data, so its bytes stay identical from turn to turn for a given mode and providers can cache
it; `MAX_STATIC_HEADER_CHARS` caps the authored part.

**The context**, sent as a user message of its own after the system message (`ActOptions.context`, Orkeon #276), in a
fixed order from the most stable block to the most volatile, so a provider's prefix cache reaches as far into it as
it can: session preferences, attached skills, memory, declared hooks, the history window without the current
request, the environment (working directory, date, git status), the context gauge with its pressure tier.

**The request**, the prompt of the act: the request under its own heading with its permission note, alone in the
last user message. A decision profile's `guard` and `route` stages judge that message; sent in one message with the
context, the request's risk was diluted by the context around it. On a runtime that does not read
`ActOptions.context` (the `1.0.0-rc.6` release, told by an agent builder without `.cache`), the adapter puts the
context in front of the request in one message, as before.

Every prompt is written from the behaviour specified below, in this project's own words (CONTRIBUTING, "Original work
only"); [ADR 0003](adr/0003-prompts-from-a-behaviour-specification.md) records the method. Each rule has a marker
phrase that a test pins, and `tests/repository/prompt-contract.test.ts` renders every prompt in every mode to check the markers,
the header's rules and that no prompt names another product. `node scripts/render-prompts.mjs <dir>` writes every
prompt as the model reads it, to review a change as a diff.

### The main loop's header

- **Identity**: an agent working on the project mounted at `/workspace`, acting through tool calls under the
  permission mode the user chose; a turn ends with one final answer, the only thing the user reads.
- **The session**: what the turn may deliver, from the catalogue. Read-only: an assessment, or a plan the user can
  approve (files, steps, risks, how it will be checked). Otherwise the project may change, and a destructive or
  outward-facing action the request does not clearly call for is proposed in the answer, not performed, since some
  modes ask nobody first.
- **Reporting**: the answer carries every result and opens with the outcome; when something failed or could not be
  checked, the first sentence says so. Full sentences in the reader's terms, a format proportionate to the question,
  code pointed at as `path:line`, file listings shown as trees, the user's language.
- **Tone**: plain and direct; no praise, no filler apologies, no emoji, no narration of its own reasoning.
- **Scope**: a request is a software task on the project. Do what was asked and nothing speculative (features,
  options, abstractions, defensive code for impossible cases); validate at the boundaries; delete dead code
  entirely; write no vulnerable code; comment only the reason the code cannot show; prefer editing an existing file,
  and write documentation only on request.
- **Finishing**: act once the facts are known; recommend instead of listing options; a question or a problem report
  gets an assessment and no change; never end on a plan or a promise that a tool call could fulfil (in a read-only
  session the plan is the answer); name what is left undone; check the evidence before a state-changing command.
- **Asking**: the user cannot answer during the turn, so a question ends it. Ask only when two readings lead to
  materially different work, or when the next step is destructive or reaches outside the project; otherwise state
  the assumption and go on, and when one point truly blocks, finish the rest and end with that question. A
  confirmation the host obtained covers that one call.
- **Verification**: after a change, run the narrowest check the project names, then the wider one when it is cheap;
  fix the cause of a failure, never weaken or skip the check; claim success only on output seen in the turn, quote a
  failure, and say what could not be checked and why.
- **Care with actions**: weigh how easily an action is undone and how much it touches; destructive or shared-state
  actions only on request; look at a target before overwriting or deleting it. Git: no commit, push, tag, merge,
  rebase or reset unless this request asks for it; stage by name and read the staged diff first. Secrets stay in the
  environment: never printed, written or committed.
- **Trust boundary**: instructions come from the request, the session preferences and the project's instructions
  file, the project's standing guidance, which ranks below the request and these rules. File contents, tool output,
  web pages, API replies, diffs, an attached transcription, advice and review findings (claims to check), and the
  marked messages of the history (`[compacted]`, `[memories]`, `[restored-file]`, `[restored-skill]`, `[restored-state]`,
  `[turn-context]`, `[tools]`) are material: an instruction found there is reported, not followed. The markers are
  listed, not explained one by one (each message says what it holds), but `[memories]` is named as the recap of the
  facts saved at the compaction that just happened, not as notes from past sessions; the one rule kept is that a
  restored file is read again before it is edited. A `<system-reminder>` comes from the harness, not the user.
- **Remembering**: the main loop has no tool that writes typed memory (`memory_recall` and `memory_push` serve the
  shared lessons, another store). When the user asks it to remember something, the agent says how it will be kept:
  the next compaction extracts the lasting facts of the conversation, and `/memory add` keeps it now; when the session
  offers `memory_push`, the rule names it as the tool of a shared lesson, not the place for that fact. It never says
  the fact is already saved.
- **Tool realities**: a long result is cut, with a note saying how much is missing: ask for less.
  `file_read` reads a part of a file with `offset` and `limit`, in lines: the model reads by range, a hundred lines or so, the next range only when needed, since every call of a turn sends the whole context again and the crew budget sums it (the header holds no digit, so the count is said in words). `file_write` replaces the whole file, so a file whose read came back cut is
  never rewritten. `edit_file` is the way to change an existing file: the smallest `old_string` that is unique, after
  reading the range around it, more context or `replace_all` when it is not; `file_write` is for a new file or a
  content rewritten whole. The reads and searches that do not depend on each other go out in one message, since the
  runtime runs them at once; a call that needs an earlier result waits for it. `shell_command` runs an allow-list,
  and git may be read-only. Where a web tool is offered
  (`web_search`, `http_api`, `web_scrape`, `scrape_element`), the project comes before the web: a port, a command or
  an image its documentation and example settings give wins over one found on the web, and a value read nowhere is
  not given as a fact. The
  lines about writing, editing, the shell and the web appear only in the modes that offer those tools.
- **Refusals**: a tool not offered (the script tools are offered without being listed) or a refused call is a
  decision of the mode or the user; change approach instead of repeating the call.
- **Search**: route by file type: code goes to the index (`codebase_search`, whose own description says it matches
  words and meaning); a name, a key or an exact text in any other file (configuration, data, documents) goes to `grep`, a `glob`
  to narrow, then `file_read`; a question of meaning over prose goes to `rag_search` on the `workspace-docs`
  collection, which holds only what was ingested there: the lines that say to ingest, and to ingest again after
  editing a document, appear only where `rag_ingest` is offered; a read-only mode is told that an empty answer
  there is no proof of absence. Trust the freshness of the code index
  (edited files are reindexed before a search answers). The shell, where it is offered, is for builds, tests, git
  and the project's scripts, never for reading, listing, finding or searching files, which the tools do; where it
  is not, a file no index covers is found with `glob` and read.
- **Question to tool** (`shared/domain/code-intel-routing.ts`): each kind of question goes to the tool that answers
  it, with the parameter that makes it answer: the shape of the repository to `codebase_map`, a symbol to
  `codebase_search` (`filter_kinds` for one kind), one type's bases and what derives from or implements it to
  `symbol_detail` with `expand: "Inheritance"` (the flags as the schema spells them), who calls or extends a symbol
  over several hops to `sub_graph` going backward over `calls` or `inherits` edges, every edge of one kind across the
  index or under a `root_fqn` (every base class, implementation or import) to `edge_list` (Orkeon #280), paged by
  `next_cursor` with a `total`, callers, impact and the tests concerned to `symbol_detail`, `impact_analysis` and
  `affected_tests`, a code shape across the repository to `structural_search` with its `language` (the pattern
  syntax is the tool's own description), a text to `count_pattern` or `grep`. Each line shows the call with the
  argument the tool needs (`codebase_search(query)`, `flow_trace(from)`, `affected_tests(changed_files)`), the
  parameters the runtime's schemas publish and nothing the tool's own description already says. A line is written only when the agent holds every tool
  it names, so the reviewer (its charter's tools, fewer for a next batch) and the auditor get the same routing,
  cut to their tools. The preamble sends a question to the index before reading or scripting. To an agent that holds
  a shell, the rule on a result marked `truncated` adds that a narrower question beats a script over every file; the
  others, the reviewer and the auditor among them, are told to ask the index before reading. A
  result marked `truncated` is a sample: the answer says so and the question is narrowed (a package, a `root_fqn` to
  an agent holding `codebase_map`, `dependency_graph` or `edge_list`, the tools that take it, a `glob`); the runtime
  marks a result `truncated` only when more exist than it returned (Orkeon #283), which is what makes it a sample. The bounded reading rule the dev readers share (`shared/domain/dev/reading-rule.ts`) asks for the reads
  already known in one turn, since the runtime runs them together, and is the one place that forbids reading a whole
  file for its own sake.
- **Project instructions**: the project's `AGENTS.md`, else its `CLAUDE.md`, verbatim, under a heading that names
  the file.

### The main loop's context and request

- **Preferences** (a `<system-reminder>`): the output style (`default` renders nothing; `concise` keeps a requested
  explanation, error output and safety warnings whole) and the answer language (the `answer.language` setting).
- **Skills**: the attached playbooks, to apply to the task, each capped and marked when cut.
- **Memory**: the notes saved earlier, in this session or a past one (at a compaction or with `/memory add`; the
  runtime keeps typed memory per project when its persistence is on, Orkeon #286), introduced as true when written
  but possibly out of date: check that what a note names still exists; the request wins.
- **Hooks**: what is declared, and that nothing runs it yet.
- **History**: the earlier turns, oldest first, without the current request, possibly opened by a compaction
  summary, or by a `[compacted]` note saying that earlier turns were removed without one: its intro says a
  `[compacted]` message is either, and that the gap a note names is reported, never filled in; it keeps what was said
  and, per turn, a `[tools]` message naming the calls made, not their results, so a
  file is read again before it is edited or quoted, and a question about how an earlier answer was found is answered
  from that message, not guessed. It is a window over the buffer (`windowHistory`): the last 50 requests and
  answers (`HISTORY_WINDOW`), with the `[tools]` and `[turn-context]` messages between them, which take no room in
  it, and the marked messages (`[turn-context]`, `[tools]`, the `[compacted]` summary) just before the oldest one
  kept, so the window never cuts a kept request from its context.
- **Environment**: the working directory, today's date, and the git status as it was when the turn began.
- **Gauge** (a `<system-reminder>`): the tokens used against the window and the session cost. At the warning tier,
  finish the current step and stop reading whole large files; at the error tier, wrap up and suggest `/compact`.
- **Request** (the last message, apart from the blocks above): the request under its own heading, then the
  permission note of the mode (read-only: deliver an
  assessment or a plan; otherwise the host may ask before a call), then the proactive clause when `/proactive` is
  on.

### Compaction and memory

- **Pipeline** (`shared/application/compaction/compact-session.ts`): every compaction past the trigger, and every
  `/compact`, pays one summary call. The summary is written from the buffer as it stood before any cut, the same
  transcript the memory extraction reads (its head and its tail kept when it must be clipped), so it sees the whole
  session and not only the last messages. The bare snip (the head and the last turns, each kept whole: a turn is a
  request with its `[turn-context]`, its tool traces and its answer) is `/compact --snip` (three turns unless told
  otherwise), and the fallback when the summary comes back empty or its call fails (two turns, so that the window,
  past the trigger, is freed; a buffer that holds no more is left as it is, and the compaction fails without a
  fallback): the buffer is then cut and a `[compacted]` message added right after the head, before the kept turns, saying that earlier turns were removed without a summary and to ask the user for what is missing, so the
  agent reads the gap as a gap; the outcome still counts as a failed compaction for the breaker. A compaction at the
  head of a turn keeps the request still waiting for its answer, with its `[turn-context]`, at the end of the rebuilt
  buffer, after the summary and what comes back, so the answer stored next follows its request.
- **Summary** (`shared/domain/compaction.ts`, `buildSummaryPrompt`): the summary replaces the history, so it is
  written for a reader who resumes cold: the request and how success is judged; the user's constraints and preferences
  still in force, close to their own words (above all an instruction to work differently), and what the user allowed
  or forbade, in their words and with the scope they gave it, so a permission neither widens nor vanishes across the
  cut; what is done and checked, with paths and commands; what was learned (decisions and why, failures and their
  cause); what remains, in order, opened by the step under way at the cut and the state it left the files in, with
  blockers and open questions; the latest request, quoted. It is told what comes back on its own after the compaction,
  with its limits: the saved memories, the project's instructions file, a few of the most recently named files (a
  large one by its name only) and the attached playbooks; so it still names every file it touched and the change made
  to it. An earlier `[compacted]` summary found in the transcript is folded into the parts, neither dropped nor copied
  as a block, and a `[compacted]` note of turns removed without a summary is reported as a gap, under "Still to do" or
  "Learned"; a clip marker of the transcript, or a `[tools]` line whose result is not shown, is reported as unknown,
  never filled in. No tools, no preamble, a length cap, and the answer between two fixed markers: the text outside
  them is dropped, and an empty summary fails the compaction, which the breaker counts. The transcript is framed as
  material and keeps its head and its tail when it must be cut. `/compact <focus>` names what the summary must keep
  above all.
- **Memory extraction** (`buildMemoryExtractionPrompt`): one self-contained fact per item, worth keeping beyond this
  conversation, in a category defined together with what does not belong there (`user`, `project`, `feedback` with its
  reason, `reference`); nothing the repository already records, no secret, nothing only a tool output or a pasted text
  claimed; when in doubt, leave it out; an empty list is a valid answer. The extraction receives today's date (the use
  case reads the `Clock` port; the UTC day, as the Environment line gives it), so a relative date in the conversation becomes an absolute one in a memory.
  The entries memory already holds are listed by their number, the most recent first, not to be repeated; a new fact that makes one of them
  out of date names it (`replaces`), and the use case replaces that entry in place (`memory_store` `replace`), or adds
  the fact when the store refuses; a number the list did not show, or named twice, is ignored.
- **Memory recap** (`[memories]`): the facts saved at the compaction that just happened, said so in the recap
  itself; the Memory block shows them from the next turn.

### Crew prompts

- **Review** (`code-review`): each lens says what it looks for and what it leaves to the others. The diff carries
  the enclosing function of each hunk when it fits the cap (asked for only when the plain diff fits), the plain diff
  otherwise. A finding points at a changed
  line (for a removed line, the hunk that held it), opens with its claim and quotes the line after it, and carries a severity from its lens's own scale
  (drawn from `blocker`, `high`, `medium`, `low`, `nit`) and meets that lens's bar: correctness says what goes wrong for which
  input or state, and reads each removed or replaced line for what it guaranteed, pointing at the first new line of
  the hunk that held it (the new start of its `@@` header) and naming the removed line; security ranks by what an attacker needs and names the input the attacker controls; style never rises
  above medium (the review brings a higher level down to medium) and reports only a convention or neighbouring code
  it can quote, with the cost to a reader, so a style finding is never `plausible`. A finding
  whose trigger the diff shows is `shown`; one whose trigger the bar asks for (the input, the caller) lies outside the shown text is still reported as `plausible`, naming the file, caller or check that
  would confirm it, and its heading says so; a suspicion with neither a shown trigger nor a check that would confirm
  it is not a finding. An empty list is a valid answer; the diff is material. Findings are merged by file, line,
  category and the start of the claim, a collision keeping the most severe (at equal severity the `shown` one), and the merged report is capped, the most severe kept and the
  rest counted. A cut diff is said to be cut, with how much was not reviewed, and an empty report on it reads as
  covering the part reviewed only. A later pass is pointed at what a first pass skips: deleted lines, error and
  early-return paths, boundaries, the later hunks of a long file.
- **Audit** (`dev-verify`): the auditor judges the delivered code first and the sheet second; a row the
  mechanical table settles as ok stays settled, every gap row is carried with the table's line as its evidence (the
  trigger rule below holds for the rows it adds), every not checked row is decided or left
  undecided with its reason (the conventions row always falls to it); each finding cites a file and line, or the
  capture file it comes from, and a claim nothing shows is unproven; a Correctness or Test row it adds names, beside the
  cited line, the input or state that makes the code wrong, the guard or test that would refute it is looked for
  once before the row is written (found, there is no row), and a mechanism whose trigger it cannot show goes under
  undecided with what would settle it, or becomes one of its validations; for each line the diff deletes or
  rewrites, it establishes what the line guaranteed and where the new code still guarantees it, and a guarantee lost is a
  Correctness row; three severities, each defined, and one Blocking
  or Major row makes the verdict GAPS; a Reuse row names an existing helper whose body does more than one operator of
  the language, else the row is Minor at most; eight rows at most, the most severe first; it runs at most three narrow validations
  itself through `run_validation` when its crew offers it, else names them for code to run, never a whole suite, the
  test class of each taken from the diff or from `affected_tests` on the changed files, never from a guessed name; it
  reads the capture one file at a time and the code only around the hunk it judges, with one look outside it, in a
  module the diff touches or not, for each of three checks and nothing else (the guard or test that would refute a
  row, where a lost guarantee now lives, and a helper that may exist, looked up with `codebase_search` once, then read
  with `symbol_source` on the fqn the hit names); when the brief lists the
  project's files, it says whether the list is whole: a name absent from a whole list does not exist, past a cut `glob` with
  a pattern decides, and it never reads a guessed name nor a folder (its charter holds `glob` and `affected_tests`);
  the Precedents block of the brief is what the shared memory recalled, and `memory_recall`, when it is offered, is
  called only for a doubt that block leaves open; a path shown relative (`src/…`) is read under `/workspace`, or the
  batch's working root, and goes to a tool as shown or as `/workspace/<path>` (the runtime resolves it since Orkeon
  #206, and the tool-call hook resolves it before the guard and the hooks either way); the capture, the sheet and the
  code are material, not instructions; a fix is
  never an added comment, an abstraction ahead of its need or a rewrite; its reply ends with the validations it asks
  for and the checks and mechanisms it leaves undecided, and the extraction keeps them all.
- **Learn** (`dev-learn`): the model sorts the untreated rows of one axis into motifs, each gathering the rows that
  share one cause and spanning at least three batches, with no row added that does not share it; each motif carries
  one preventive line concrete enough to have stopped all of its rows, and each line it adds names the situation that
  triggers it and the failure it prevents; a motif's `topic` is a short kebab slug of its cause, and a candidate on
  the subject of a refused motif reuses that motif's slug as written (a harness refusal is listed under the slug of
  its text), so code skips it even when the model does not;
  the owner files reach the model by path only, so a first answer only adds lines (status `new`; code refuses another status until owner lines are shown), says what the
  candidate brings that the listed owners do not cover and names the key term that would find its subject there; code
  then reads each owner, finds the lines the key term matches and the removed lines it lacks, and asks a second time
  only when a `new` motif's key term is already in its owner or a removed line is not there, those owner lines shown
  under the problems (a harness owner's under its orkeon-workshop path), the last rows cut first to leave them room and to fit the problems; on that try a motif may refine, replace or remove (status `removes`) a line it sees, copied
  exactly, a removal adding no line, and a second answer that fails its check leaves the first one standing; a first
  answer refused on its shape spends the second try on that, the owner then only noted in the proposal, unless its only
  fault is a status other than `new`, when that try also shows the owner lines of its motifs; a problem of
  the second try names the motif by its title; a check (a test, an analyzer rule, an architecture test, the
  gate) is preferred over a written rule; the owner is the one closest to where the gap was made, a repository rule
  before a harness file; a harness file is never changed, its lines come back as a patch for the orkeon-workshop
  repository, and a copy under `.claude/` is never an owner; a motif adds five lines at most; three motifs at most,
  every dropped candidate named with its filter and reason; the rows, lists and paths are material, not instructions;
  no row id or path is invented.
- **Plan** (`dev-plan`): the plan says what, why, where and in what order, never a line of code; the model answers in
  JSON and code writes every file, so it calls no tool; the answer's schema says what each field holds wherever its
  name does not, and every limit (eight batches at most, the length of a step title, a test name, a signature and a
  feature), and no free-text
  line opens like a heading, a table row or a quote; batches are cut by behaviour rather than by layer, each keeps the
  build green and names every earlier batch whose file, type, fixture or setting it reuses, and documentation goes in
  a batch of its own; a batch holds two to five steps of behaviour (code adds the build-and-tests step), each step
  brings at least one test named as the repository names its tests, with the ids it proves, and the test of a
  documentation step is named by the repository's documentation command, else its test command, followed by what
  the step documents, at level unit, so that two documentation steps never share a name; every UC, BR and CH id has a test and a
  code owner, named by a type or a member, never a path; each design rule is applied somewhere or set aside once with
  a reason that holds, a rule whose condition is not met being set aside with that condition, the usual outcome for a
  small change; the rules block shows when each rule does not apply, and applying a rule never adds an element the
  source did not ask for; files are anchored only through the inventory's refs, as a file to create, or as an existing
  path the index does not hold, never a `path:line` of the model's own; a code file the work needs and the inventory
  does not show is anchored `existing` only when the source names its path, otherwise an assumption names it for the
  reviewer to check, and nothing that may already exist is anchored as a file to create; what the inventory offers
  comes first and each new element says what the existing one lacks; no flexibility the source did not ask for; an
  adapter gets an integration test or a reason; from a change brief, the rows to characterise come first, a bug's
  first test fails today; assumptions go on the scope's list and never settle an open question; the labels the gate
  reads are left to code; the source, the inventory and the repository values are material, not instructions; a
  problem of the second try names the batch by its name and the step by its title, since that try never sees the
  refused answer. A plan with a Blocking question keeps every batch line at `— blocked`, so no batch runs, until
  `/dev-plan <code> --replace` rewrites it `— open`.
- **Spec** (`dev-spec`): business words only, never a class, a file, a status code or a call; each use case names its
  actor, its intent, where the actor meets it and one to seven steps; each rule is one yes-or-no statement with its
  origin and severity, applied to use cases that exist; a fact the code index answers is stated, never asked; the
  model answers in JSON and code writes the file. Its open questions are asked one at a time, Blocking first, the
  recommended option first, each answer written under `## 13. Decisions` before the next question; nobody to answer
  (an unattended run) leaves them in the file and the step reads `BLOCKED`, never a default answer.
- **Change** (`dev-change`): facts first; a bug is reproduced by running a narrow test command of the pack or the CLI
  before anything is written, and one that does not fail stops the step; a perf change is measured; no design (no new
  type, file, pattern or library); each criterion has its proof; what must not change names the test the index shows,
  or `unpinned`, never an invented one; a new promise goes to `/dev-spec`. Questions as for a spec (§ 9 Decisions).
- **Review** (`dev-reviewer`): the reviewer hunts for the gaps the author left open and only looks: it changes no file
  and runs no command, and code records what it reports; each finding is one sentence ending in a question that a
  yes, a no or a choice among listed options settles, and it cites a `path:line` it opened or a section of the files,
  or it is dropped; Blocking when any answer would reshape a use case, a rule, the data, a state, the scope or a
  design choice, Major when an assumption on record is enough, and Major when torn between the two; before asking,
  it looks for the answer in the rest of the material (the other files the brief names, the code), and a question
  that material already settles is no row; style is out of scope and an empty list is a CLEAR
  answer; each question targets the plan (or the spec, the brief) or one batch by its id alone, and the extraction
  names the ids it may use: a qualifier after the id (`F2 (step 1)`) is folded to the id, a target naming two ids
  is dropped; the rule on the project's files is said only in the modes whose brief carries the list (the next
  batch's): the list says whether it is whole, a name absent from a whole list does not exist, past a cut `glob` with
  a pattern decides, and it opens no guessed name (every reviewer charter holds `glob`); for a plan it checks which
  type guards each rule, unused existing elements, the reasons given for rules set aside, a
  file a step touches that no anchor names, and a step on something a person runs or sees that anchors no existing
  file, while what code already checks (anchored paths exist, batches sharing an anchor are ordered) is not asked
  again; it reads a source file node first (`node_outline`, then the node it needs) and other files by range, the
  source of a symbol a search hit names with `symbol_source` on its fqn, a file by its name or a pattern with `glob`
  where no project list already says so, each said only to a charter holding the tool; it
  opens only what the files point to, around the cited line; twelve questions at most, the heaviest first.
- **Commit** (`git-commit`): the prompt sees what will be committed and nothing else, the changes and the start of
  the new files of an explicit list: every path the status lists, or those under the paths named, the work folder
  left out unless a path inside it is named (which its confirmation says). The list is staged with `git add -- <files>`
  and committed with `git commit -- <files>`, so what was staged elsewhere stays out; git's own identity
  (`git var GIT_AUTHOR_IDENT`, then the committer's) is checked before any model call, and when it has none the crew
  stops and hands over the two `git config --global` commands, never inventing one. `--push` pushes with
  `git push -u origin <branch>`; off the default branch the pull request body is written to `<work>/pr-<slug>/PR.md`,
  and the pull request opened with the runtime's `github` tool (`create_pr`) when `--pr` or `dev.prAuto` ask for it, the host offers the
  tool and the session allows it; otherwise the `gh pr create` command is printed with the reason. The runtime
  reads the tool's token once, at registration: `Orkeon:Tools:GitHub:Token`, else the variable
  `Orkeon:Tools:GitHub:TokenVariable` names (`GITHUB_TOKEN` by default), else `GH_TOKEN` (Orkeon #222); the launcher's
  Docker mode hands those variables to the container ([Configuration](configuration.md#settings-orkeon-code-relies-on)). The same close (`shared/application/git/`) serves the dev close and the fast-forward merge of a parallel run's VALID batch. The
  message follows Conventional Commits and the style of the recent history, a bounded subject, a body that says why
  only when the change shows it (a test naming the case, a comment, a guard against a named input) or the author
  gives it with `--note <text>`, passed as their reason; never a motive, an issue number or a benefit the material
  does not show, the subject alone otherwise. When the diff or the new files are cut, the subject comes from the
  status and the part shown, and the body describes nothing it did not see. A value that looks like a real credential
  gets a refusal instead of a message (a placeholder, an example value, a name read from the environment or a test
  fixture is not one), and a path that usually holds secrets
  (an env file, a private key) stops the commit before any model call.
- **Instructions file** (`project-init`, `/init`): writes `AGENTS.md`: what the project is, the commands as its
  configuration states them (build, all tests, one test, lint, run), the architecture that takes several files to
  see, the conventions a newcomer would get wrong; nothing invented. The configuration read is the manifest list
  both crews share (`shared/domain/project-manifests.ts`), the files that state commands first since the material
  is bounded: the manifests with scripts or targets (`package.json`, `pyproject.toml`, `Makefile`, `justfile`,
  `Taskfile.yml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `build.gradle.kts`, a `*.sln` or `*.csproj` at
  the top level), then the content of the CI workflows (`.github/workflows/*`), then the rules (`tsconfig.json`,
  `.eslintrc.json`, `.eslintrc.js`, `eslint.config.js`, `eslint.config.mjs`, `biome.json`, `ruff.toml`,
  `.editorconfig`), `CONTRIBUTING.md` last; a name outside this list (`.eslintrc.yml`, `Taskfile.yaml`) is not read. Each file is cut at
  4 000 characters, its cut marked; the whole is bounded at 24 000 characters, whole files kept in that order and a
  closing line naming the files left out. A CI step is a valid source of a command. Each command is taken from the
  configuration first (the conventions extract, `runCommand` included), from an existing instruction file when the
  configuration states none, never from the README's prose.
  - *Architecture*: `/init` receives the code index through the `CodeIndex` port, the one `/analyze` uses. When the
    workspace has an index (its root count above zero), the material carries a bounded rendering of its package map
    (the packages and which depends on which); the Architecture section is drawn from that map, the README and the
    existing files only, names packages as the map writes them, adds nothing they do not show. The map's header
    gives its count of packages and says when it reached its bound of 200; a map too long is cut and marked, and the
    prompt reads that mark as it reads the mark of a cut file. With no map, it keeps
    only what the existing files say of the architecture, or is left out. Without an index `/init` runs as before and starts no indexing.
  - *What the file leaves out*: lists of files, folders or packages, generic advice, secrets, the conventions of the
    language any agent already knows, long references or tutorials (the file to read is named instead), facts that
    change often. A section fits on a screen. These rules, the list ban included, apply to what `/init` writes new
    and give way to what an existing file says that is still true, whatever its shape (a secret aside): a list of
    files or folders, a long reference, a section past a screen or a fact that changes often found there is not
    dropped; it is named by its file when that file stays on disk (any but `AGENTS.md`), and kept as it was under a
    last `## Reference` section when only `AGENTS.md`, the file replaced, says it.
  - *Existing files*: the existing instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`,
    `.github/copilot-instructions.md`) reach the model whole up to 40 000 characters each and 120 000 in all, and are
    merged, not lost. A file above that bound is cut, a later file is cut to what is left of the total (nothing of it
    shown once the total is spent), and each cut is marked in the material; the prompt says that a marked file was cut
    and that the model works from what it sees. The use case then does not overwrite: it writes the proposal to
    `AGENTS.proposed.md`, and the outcome says so and names the file that was cut, so nothing on disk is lost; it
    says `AGENTS.md` is left as it is, or not written when the project has none.
- **Verifiers** (`init-verifiers`, `/init-verifiers`, `/verify`): the readiness classification defines each value and
  leaves an unknown empty. Both prompts see the manifest list `/init` reads, the `## Commands` section of the
  project's instructions file when one exists (the file the loop reads, the first of `AGENTS.md` and `CLAUDE.md`
  present and not blank; a heading inside a code fence neither starts nor ends it; cut at 4 000 characters, its cut
  marked), and the content of the CI workflows (`.github/workflows/*`), read
  among the manifests and cut like them; the skill prompt names these as the only sources of a command, so a Python, Go, Rust or .NET project gets steps with real
  commands, and a command no source shows stays forbidden. A verification skill has a fixed outline (prerequisites,
  steps with their commands, the expected signal, what to report).
  - *Lifecycle*: a zone that keeps running (a server, a web UI) is started only when the material shows how to start
    it, to tell it is ready and to stop it: then it is started without blocking the step, waited on for a stated
    readiness signal, and stopped at the end; else the step says the zone is not started and what would be needed to
    start it. A step that writes, deletes or calls the network points at a scratch folder or a dry-run flag the
    material shows, or says it cannot be checked safely.
  - *Failure shape*: `## Pass` names, beside the success signal, the one or two observations that mean failure.
  - *Verdict only*: the skill's `## Report` and the `/verify` request say that a failed check ends in a report with
    the quoted output; a fix is a separate request, so the loop never edits code to make a step pass.
- **Analysis** (`analyze`): answers only from the harvest, cites symbols and packages as the harvest writes them
  (relative to the checkout), takes the entry points from its entry packages, names the members of each cycle the
  harvest names, says what the harvest leaves out. Each of its three parts is bounded so the whole fits a screen: a
  line per concept, about ten concepts at most, the largest first; a line per dependency group and one per cycle; a
  line per entry package; written in the session's `answer.language` when one is set, the note that a part is not in
  the harvest included.
- **Advisor** (`advisor`): a second opinion that reports problems worst first and may say there is nothing to add.
  Since it sees no tool call, an action or a result the answer reports (a test run, a file read) is taken as reported
  unless the exchange contradicts it, and flagged only when nothing the answer says it did could support it, with
  the check that would settle it. Each point quotes the few words of the answer it targets, says why they are wrong
  or unsupported and names the file, command or fact that would settle it; five points at most. The earlier turns
  are context for the request's scope, not under review.
- **Session summary** (`/summary`): where things stand first, then fixed headings, bounded, in the conversation's
  language, from the history alone (the compacted turns included: a summary is covered, a note of turns removed
  without one is reported as a gap, never filled in).

The prompts that apply instructions to material (the summary, the commit message, the second opinion, the
instructions file, a verification skill) send the instructions as the system message and the material as the user
message (`Llm.complete` with `system`, over the runtime's message-array call).

## Context management

- **Automatic compaction** at the head and the tail of each turn when the buffer crosses its threshold, behind a
  circuit breaker kept in the session state so a failing compaction does not loop.
- **`/compact [<focus>]`** moves the lasting facts into typed memory, then summarises the whole session, the buffer as
  it stood before any cut; the summary keeps a fixed set of parts, weighted toward the focus when one is given. The
  bare snip (head plus the last whole turns) is `--snip`, and the fallback of a failed summary, marked in the buffer. The thresholds and budgets are derived in `shared/domain/compaction-thresholds.ts` from the
  facts they depend on (the runtime's cut of a file read, the example settings' answer size, the header's ceiling).
- **File restore** re-reads, after a compaction, the files the conversation was working on (whole, or named with a
  note to read them again when too large: never a cut copy), and the attached skills.
- **Pressure tiers** (`/usage`, `/context`, and the gauge of every turn) tell the user and the model how full the
  window is.

Both compactions run the same pipeline, `shared/application/compaction/compact-session.ts` (`compactSession`), over
the ports its entry point wires; `restore-context.ts` and `extract-memories.ts` hold the restoration and the memory
extraction, `shared/domain/compaction.ts` the prompts and buffers, `shared/domain/compact-outcome.ts` the outcome.

## Recipes

### Add a command

1. Write `src/commands/<group>/<name>.cmd.ts` after the pattern above, `<group>` the functional folder it belongs to: one `name: "<literal>"` in kebab case, a static
   `description`, no top-level `export`.
2. Put the logic worth testing in `src/commands/_lib/<group>/<name>.ts`, the same `<group>` as the command, as
   `run<Name>(tokens, deps)` returning a `CommandView`, its deps a `Pick<>` of the ports and services it reads; test
   it in `tests/commands/_lib/<group>/<name>.test.ts`, over the fakes. A helper that several groups share
   sits at the root of `_lib/`; a group never imports another one.
3. Raise `EXPECTED_COMMAND_COUNT` in `tests/repository/command-surface.test.ts` and the command count of `RELEASE_NOTES` in
   `src/commands/_lib/status/meta.ts` (pinned by `tests/commands/_lib/status/meta.test.ts`), then run `npm run docs:commands`.

### Add a crew

1. Create `src/crews/<name>/crew.ork.ts` after the pattern above: the two header lines (`// @orkeon-script 1.0`, then
   the reference to `../.orkeon/orkeon.d.ts`), the agents with the tool names they need, `publishCrew(...)`.
2. Put the use case in `application/run-<name>.ts` (`run<Name>(input, deps)`), its pure rules in `domain/`, each with
   its `*.test.ts`; the use case test runs over the fakes.
3. Start it from an async command (`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<name>",
   input)`), and name it in `RELEASE_NOTES`
   (`tests/commands/_lib/status/meta.test.ts` checks that every crew folder is named there). A folder starting with `_` is a
   development probe (`probe.ork.ts`), never listed to users.

### Add a tool

1. Check the name the runtime registers (`/debug-tool-call list`): an unknown name in `.tools([...])` fails every
   `act` call of the agent. A tool of an MCP server or a plugin needs no code: the user lists it in `tools.extra`
   (`shared/domain/agent-policy/extra-tools.ts`), and the launching command offers it if the host registers it.
2. For the main loop, add it to its class in `src/shared/domain/agent-policy/permission.ts` (`READ_TOOLS`,
   `NETWORK_READ_TOOLS`, or the edit and shell classes): the mode-policy table decides which modes hand it to the
   model. Update `permission.test.ts`, and `docs/permissions.md` when a mode's surface changes. Another crew names
   it in its own `.tools([...])`.
3. When application code calls the tool itself, it goes through a port: its input and result are typed by the
   generated typings (`crews/.orkeon/orkeon.d.ts`, `OrkeonTools`; `orkeon/runtime-tools.ts` keeps a stricter local
   shape only when the adapter wants one), add the call to an adapter (or a new port, below) that reads the result
   through `tool-results.ts`, test the adapter over `FakeTools`.

### Add a permission mode

A mode is stated once: an entry of `PERMISSION_MODES` (`src/shared/domain/permission-modes.ts`, and `MODE_CYCLE`
when bare `/mode` should cycle through it on a console without panels) and a row of `MODE_POLICIES`
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
2. Give it a field of `ContextParts` and its place in `assembleContext`'s fixed order; a block of the static header
   must hold no per-turn data, or the provider's cache breaks.
3. Read its input in `application/context-gather.ts` (through the ports) and pass it in `application/turn-prompt.ts`;
   test the renderer in `prompt-assembly.test.ts` and the turn over the fakes.
4. Specify the behaviour first, in "Prompt assembly" above, then write the text from it in this project's own words
   (CONTRIBUTING, "Original work only"); pin a marker phrase of each rule in the test, and run
   `node scripts/render-prompts.mjs` before and after to read the change as the model will.

### Add a config key

1. Declare it in `CONFIG_KEYS` (`src/shared/domain/config-schema.ts`): key, description, allowed values, the
   consumer. A key nothing reads must not be settable.
2. The consumer takes `Pick<ConfigStore, "readValue">` as a dependency (wired with `orkeonConfigStore()`) and reads
   `(await config.readValue(key)).value`, falling back to its default when the value is absent or unreadable.
3. `/config keys` lists it with its allowed values and the commands that read it, and `/config get` shows its
   description while it is unset; name it in `docs/configuration.md` ("Session settings") when users should know it.

### Add a port

1. Declare the interface in `src/shared/application/ports/<concern>.ts` (a new concern is a new file), named
   after the need, with its failure contract (which calls throw, which are best effort), and add its name to the
   `export type` line of that file in `ports.ts`, which every importer names.
2. Write the adapter `src/shared/infrastructure/orkeon/<port>.ts`: `create<Port>(runtimeObject)`, the tool inputs
   declared in `runtime-tools.ts`, the results read through `tool-results.ts`. Bind it in `wiring.ts` when it reads
   the `tools` global; otherwise the entry point builds it from its context.
3. Write `tests/support/doubles/fake-<port>.ts`, a class `Fake<Port>` implementing the port with plain fields to configure
   and inspect, and the adapter's test over the runtime stand-in.
4. A port lands with its first production caller, never ahead of it.

## What the probes established

Three probes ran against the runtime before they were removed. Code intelligence: every tool name and field the
adapters use was read off live calls, and is pinned by `shared/domain/code-intel-contract.ts` and its test.
Raggable: `index_codebase` then `codebase_map` work end to end, the languages detected without being named. Budget:
a `toolCalls` budget stops `act` with a typed `BudgetExhaustedException`.
