# Architecture

Orkeon Code is the TypeScript half of a coding agent; the [Orkeon](https://github.com/Orkeon/orkeon) runtime is the
other half. This page describes how the two meet, the constraints the runtime sets, the layers of the sources and
the rule between them, and how a request reaches a crew. The reasons for the layering are recorded in
[ADR 0001](adr/0001-clean-architecture.md).

Three pages continue this one: [How a turn runs](turn.md) follows a request through the main loop,
[Crew prompts](crew-prompts.md) specifies what each crew's prompt must produce, and [Recipes](recipes.md) lists the
steps of the common changes.

## Two halves

| This repository (TypeScript) | The Orkeon runtime (.NET, pinned to a commit of its `main` in `.orkeon-version`) |
|---|---|
| Slash commands (`src/commands/<group>/*.cmd.ts`) | The scripted-commands REPL that loads them (`orkeon-repl --runner=scripted-commands`) |
| Crews (`src/crews/<name>/crew.ork.ts`) | The script engine (Jint) and the bundler (esbuild) that run them |
| Prompts, parsing, decisions (`domain/`, `application/`) | The tools (files, shell, git, code intelligence, web, session, memory) |
| The permission catalogue per mode, the session's rules | The permission gate that checks every tool call of the model (`act`) against the rules and the mode, and asks the operator |
|  | The VFS: `/workspace`, `/output`, `/tmp`, the read-only `/crews` and `/cli-commands` |
|  | LLM providers, streaming, cost and token accounting |

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
  reaches a later run; otherwise in the Orkeon process, which it dies with.
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
- **`onToolCall` runs before the host's gate**. The gate judges the input the callback returns, once; a
  `{ deny }` from the callback never reaches it, and an `"ask"` is judged as an edit in `default` once the act's mode admits the call.
  The callback therefore sees calls the gate then refuses; those come back to the model, and to `onToolResult`, as a
  `DENIED:` result.
- **The read calls of a turn run together.** `Orkeon:Tools:ResultLimits:MaxParallelToolCalls` (4) read calls of one
  model turn run at once; every other call runs alone, one after the other.
- **`spawn_agent` is the host's own.** The script host offers it to every act; naming it in `.tools([...])`, or in
  `act({ tools })`, throws `UnknownToolError`. A child runs under the stricter of its mode and its spawner's (Orkeon
  #299); this project's children name none.
- **The code-intelligence tools are pinned by a contract.** Every tool name and field the adapters use was read off
  live calls, and is pinned by `shared/domain/code-intel-contract.ts` and its test.
- **The index needs no language list.** `index_codebase` then `codebase_map` work end to end, the languages detected
  without being named.
- **A budget stops `act` with a typed error.** A `toolCalls` budget stops `act` with a typed
  `BudgetExhaustedException`.

So each entry point is its own composition root: it builds the adapters it needs and hands them to a use case that
takes its dependencies as parameters. The ports are interfaces, erased from every bundle, and a test imports a use
case in Node without touching a runtime global.

## The VFS and the host platform

Every path the code or the model writes is a virtual one: the runtime maps it to the disk, and the rules are the
runtime's (Orkeon's `FileSystemRegistry`, `ShellCommandTool` and its shell sessions), not this project's. What
follows is the contract the code and the prompts rely on; `src/shared/domain/vfs.ts` names the one mount they work
in.

### The runtime's contract

- **The mounts come from the launcher.** `orkeon-code` and `orkeon-code.ps1` start the REPL with one
  `--mount <physical>:<virtual>:<rights>` per root: `/workspace` (the project, read-write), `/output`, `/tmp`,
  `/user-config` (read-only), `/sessions`, `/session-history` (read-only) and `/memory`. The model never sees a
  physical path, on any platform: a `C:\proj\src\a.ts` or `/home/u/proj/src/a.ts` given to a file tool is refused
  with the list of the mounts, and the prompts spell a project file `/workspace/<path>`.
- **A virtual path resolves by its longest mount prefix**, compared ordinally: `/Workspace/x` matches nothing, on
  Windows too.
  - A relative path resolves under the agent's working root (`/workspace`, or the worktree of a batch of
    `/dev-batches`).
  - After the mount, `/` and `\` are both accepted by the file tools.
  - The rest is appended to the mount's physical base and normalised by the host, so `\` is a separator on Windows
    and a plain character elsewhere.
  - A `.` or `..` segment is refused for a working root and detected as a traversal elsewhere.
  - The containment check ignores the case on Windows only.
  - Physical to virtual, a path under a mount comes back as `/<mount>/…` with every `\` turned into `/`.
- **The shell runs no shell on Windows.** On Linux and macOS, `shell_command` feeds one `sh -s` per run, each word
  quoted so that the shell expands nothing.
  - On Windows each command is its own process in a Job Object, started with its arguments quoted one by one: the
    executable is looked up on the `PATH` only, never in the working directory, as `.exe` then `.com`.
  - A `.bat` or `.cmd` (so `npm`, `npx`) runs only in an unconfined session, through `cmd.exe`.
  - A cmd built-in (`echo`, `dir`, `type`, `cd`, `copy`, `del`, `mkdir`, `set`...) runs through `cmd.exe /d /v:off
    /s /c` with every argument escaped, and `%` refused.
  - PowerShell is never involved.
- **The operators are refused everywhere**: `|`, `;`, `&&`, `>`, `$(`, backticks and line breaks fail the call before
  anything runs, so no command of a crew pipes or chains. The default allowlist is `ls`, `cat`, `pwd`, `which`,
  `grep`, `wc`, `echo`, a read-only `git`, and `dir`, `type`, `where`; on Windows the POSIX names exist only when
  they are installed and on the `PATH`. `node`, `dotnet`, `npm`, `find` and the writing `git` need
  `Orkeon:Tools:Shell:AllowInterpreters`, which the example settings turn on.
- **The shell rewrites the paths of a command line.** An argument equal to a mount or starting with `<mount>/`, also
  after a `key=`, becomes its physical path before the process starts, and needs Read for a read-only command, every
  right for any other.
  - Only `/` is accepted here: `/workspace\src` is passed as written.
  - Stdout and stderr are rewritten physical to virtual, `\` turned into `/` over the rest of the path, by an
    ordinal match: a tool that re-cases a path (`c:\Proj\…`) escapes the rewrite and the model reads a disk path.
  - A relative path a command prints (`src\a.ts` from `dir`) keeps its `\`.
- **Confinement follows the platform** (`Orkeon:Tools:Shell:Confinement`, `Auto`): bubblewrap on Linux, where the
  process sees the mounts at their virtual paths; Seatbelt on macOS and an AppContainer on Windows 10 and later,
  where it works on physical paths. Under the AppContainer, `TEMP`, `TMP` and `HOME` point into the container's
  profile, the user's profile and the other drives are out of reach, and a program installed under the user's
  profile is reached through `ReadOnlyPaths`. Inside a container there is no confinement. Environment variable names
  compare without case on Windows.
- **Windows is not the path this project exercises.** `orkeon-code.ps1` has the `tool` and `docker` modes only, no
  source mode and no `--demo`; the checked path is WSL with the bash launcher ([tutorial](wsl-tutorial.md)). Run
  natively, `/status` shows the platform as unavailable when `node` is absent or not allowed, and a command a crew
  composes with an operator or a POSIX name that is not installed fails before it runs.

### Orkeon Code's own layer

What follows is this project's own layer over that contract (`src/shared/domain/host-layout.ts`, `host-paths.ts`,
`agent-policy/path-rules.ts`, `src/shared/application/host-context.ts`; [ADR 0022](adr/0022-host-path-spellings.md)):
whatever the runtime rewrites, the disk's own spellings come back to the code and to the model in what a program
prints, in what the user types and in what the model writes.

- **One canonical spelling.** Every spelling of a physical path of a mount is brought back to the virtual path with
  `/` and no trailing separator, from the bases the host declares: `C:\proj\src\a.ts`, `C:/proj/src/a.ts`,
  `c:\Proj\…` (the case of a drive is ignored), `\\?\C:\…`, a UNC share (`\\server\share\…`, `//server/share/…`),
  `/mnt/<d>/…` under WSL, `\\wsl$\<distro>\…` and `\\wsl.localhost\<distro>\…` for the distribution the session runs
  in, and a `\` after the mount when the host is not posix.
  - A base is matched segment by segment: `/workspaces/x` never matches `/workspace`, `mon repertoireX` never `mon
    repertoire`.
  - Left as written: a relative path, a `.` or `..`, a path under no mount or of another distribution, `/mnt/c` on a
    posix or Windows host, `C:` on a posix host, `%VAR%`, `~`.
  - In free text a path runs to the closing quote after an opening one, else to the first delimiter (whitespace, a
    quote, a bracket, `,` `:` `;` `|`, a dot that ends a sentence), a Windows path going on over a space while the
    next word still holds a `\`.
  - On a posix host without a Windows base every function is the identity.
- **The host comes from `/user-config/launch.json`**, which both launchers write at every start beside
  `config.json`: `version` (1), `flavour` (`posix`, `wsl` or `windows`), `mode`, under WSL `wsl.distro` and
  `wsl.automountRoot` (`WSL_DISTRO_NAME` or the share of `wslpath -w /`; `wslpath -u 'C:\'` or `[automount] root=`
  of `/etc/wsl.conf`, else `/mnt`), and `mounts`, each with the very string given to `--mount` as `posix` and, under
  WSL, its Windows spelling from `wslpath -w` (`null` without `wslpath`, with a warning: the code then derives
  `D:\x` from `/mnt/d/x` itself).
  - Docker mode writes a posix host with no mount: the host is hidden there on purpose.
  - Absent, malformed or of another version, the file gives the identity, and `/doctor`'s row `host: paths` says so.
  - The layout and the path lists are read once per run, by an infrastructure module every entry point binds over
    the global tools.
  - A change applies at the next start, and an adapter loaded alone (a test) finds the identity.
- **Where the spellings are brought back.** Inbound, before the runtime: the file, shell and shell-job adapters
  canonicalise the path or the words of the command they are given.
  - The typed prompt is canonicalised, its fenced blocks kept.
  - And `hostCallbacks` (`src/shared/application/dev/tool-callbacks.ts`), the outermost layer of every act's
    callbacks (`createLlm` wraps them, with or without callbacks of the crew's own), rewrites a model call's `path`,
    `root_path`, `working_directory`, `paths`, the `path` of each operation of an `edit_batch` and the words of a
    `shell_command`, as an `{ input }` the runtime's gate then judges.
  - A file's content, an edit's strings and a pattern are never touched.
  - Outbound: stdout and stderr, the top a `git rev-parse` prints (`C:/…` from git for Windows), the message of a
    failed file call, and the text the model reads of every tool result (`{ context }` replaces it when a spelling
    changed).
  - The inner callbacks (a dev crew's, the trace, the post-tool hooks) see the canonical call and the canonical
    result.
- **Orkeon Code never spells a path physically for the runtime.** The runtime checks every mount-prefixed word of a
  command against the VFS rights before it spells it for the process, and asks every right for a command outside its
  read-only allowlist: a `C:\…` written by this project would skip that check. On native Windows the runtime spells
  `/workspace/…` for the process. Under WSL a Windows program (`cmd.exe`, a Windows `dotnet.exe`, reachable without
  confinement only) receives `/mnt/c/…` until the runtime learns the Windows spelling of a mount, an issue left to
  Orkeon; what it prints comes back canonical in every case.
- **The path lists** `paths.deny` and `paths.allow` ([permissions](permissions.md#rules)) match on the canonical
  spelling, so a physical spelling, or another letter case on a Windows disk and under a drive of WSL, reaches the
  same rule: the gate gets deny rules on the canonical spelling, listed by `/permissions`, and the callbacks refuse
  every call the lists cover, in any spelling, before the crew's own callbacks.
  - Built-in deny rules close the whole `/user-config` mount to the model's tools, the physical bases of
    `launch.json` and the user settings inside.
  - The code reads it through the Files port, which the gate does not see.
- **The gate judges the canonical input.** `onToolCall` runs before the gate (ADR 0023): a model call
  spelled `C:\…` on a path tool is converted first, and the gate judges the canonical input once. A shell command is
  judged by the gate on its text and by the callbacks on its canonical paths; every result is canonical. The runtime issues ADR 0022 left open are closed at the pin.

## Layers and the dependency rule

| Layer | Where | Holds | Imports |
|---|---|---|---|
| domain | `src/shared/domain/`, `src/crews/<name>/domain/` | Pure types and functions: rules, prompt text, parsing, rendering | domain only |
| application | `src/shared/application/`, `src/crews/<name>/application/` | Use cases and services over the ports (`ports.ts`, re-exporting `ports/<concern>.ts`) | domain, application |
| infrastructure | `src/shared/infrastructure/` | `globals.ts`, the Orkeon adapters of the ports, `wiring.ts` | anything inward |
| command use cases | `src/commands/_lib/` | The use cases in a folder per command family (`dev/`, `git/`, `settings/`...), `run<Name>(tokens, deps)` → a view over the ports it is handed; at the root, the helpers the families share | anything but `shared/infrastructure/` |
| entry points | `src/commands/<group>/*.cmd.ts`, `src/crews/<name>/crew.ork.ts` | Parse the input, wire the adapters, call a use case, render | anything |

### What the architecture test checks

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
├── commands/          50 *.cmd.ts (parse, wire, render) in eight functional folders: session, settings, status,
│   │                  project, git, dev, memory, speech
│   ├── _lib/          the use cases, in the folder of their commands: run<Name>(tokens, deps) → CommandView,
│   │                  or dispatch<Name>(tokens, deps) → a ticket or a message when the command launches a
│   │                  crew, and their pure helpers. dev/ (dev, dev-batches, dev-implement, dev-source),
│   │                  git/ (branch, commit, diff, review), memory/ (memory, memory-admit), session/ (export,
│   │                  resume, tasks), settings/ (advisor, agents, config, hooks, mode, model, permissions,
│   │                  session-config: the toggle commands, skills), speech/ (say, transcribe, voice),
│   │                  status/ (cache, doctor, meta: version; messages: release notes, status). At the root, what
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

### Where the tests live

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
| `DecisionModel` | The host's decision model, asked typed questions about a state: one option among described ones, a level on a scale, the probability of a yes | `decision-model.ts` | `fake-decision-model.ts` |
| `ChildRuntime` | The children of a crew run: spawn one in the background, list, stop, read what it left (`ctx.spawnBackground`, the crew's `instances()`/`stop()`, its memory) | `child-agents.ts` | `fake-child-runtime.ts` |
| `HumanInput` | A question to the person: a choice, a text, a multi-select; nobody answering is an answer of its own (`human_input`) | `human-input.ts` | `fake-human-input.ts` |
| `Chooser` | A panel in the console: one option among several, with an optional control on the side arrows; `interactive` says whether one can open (`ctx.prompt`, `ctx.interactive`) | `chooser.ts` | `fake-chooser.ts` |
| `ReasoningReader` | What a model of the host takes for reasoning and what an effort asked becomes on it, as the runtime judges them (the `llm` namespace: `capabilities`, `reasoning`; a named profile is read when `llm.profiles` lists it) | `reasoning.ts` | `fake-reasoning-reader.ts` |
| `ThemeConsole` | The console's palette for the session (`ctx.theme`, `ctx.setTheme`) | the command context itself | `fake-theme-console.ts` |
| `Files` | Read, write and list by virtual path, the VFS mounts (`file_read`, `file_write`, `directory_read`, `list_mounts`) | `files.ts` | `fake-files.ts` |
| `Progress` | The host's progress line, best effort (`progress_report`) | `progress.ts` | `fake-progress.ts` |
| `SessionStore` | The conversation buffer, the state bag, the title, the snip, the token budget by kind (`session_store`, `session_snip`, `token_budget`) | `session-store.ts` | `fake-session-store.ts` |
| `SessionSwitch` | The session saved now, a saved one loaded in place (the `session` service) | `session-switch.ts` | `fake-session-switch.ts` |
| `RuntimeInfoReader` | The runtime that runs the command: version, commit, channel (the `runtime` service) | `runtime-info.ts` | `fake-runtime-info.ts` |
| `UsageReader` | The session's LLM usage, in total, by model and by command (the `usage` service) | `usage.ts` | `fake-usage-reader.ts` |
| `Telemetry` | The session's metadata, cost and statistics (`session_store`, `session_cost`, `session_stats`) | `telemetry.ts` | `fake-telemetry.ts` |
| `MemoryStore` | Typed memory: list, add, get, remove, replace in place (`memory_store`) | `memory-store.ts` | `fake-memory-store.ts` |
| `ToolCatalogue` | The registered tools under their registered names, found case-insensitively as Orkeon finds them, for diagnostics and the extra tools' check (the `tools` service of `ctx.services` for the names, the `tools` namespace for the calls: `call` raw, `callText` decoded) | `tool-catalogue.ts` | `fake-tool-catalogue.ts` |
| `CodeIndex` | The code index as `/analyze` harvests it and `/init` reads its package map (`index_status`, `index_codebase`, `codebase_map`, `dependency_graph`, `package_summary`) | `code-index.ts` | `fake-code-index.ts` |
| `CostIndex` | The access cost `/dev-batches` measures: the indexed roots, the refresh of the batch's files, the report (`index_status`, `incremental_reindex`, `access_cost`) | `code-index.ts` | `fake-cost-index.ts` |
| `CrewHost` | List and launch crews (the `script-host` service, `ctx.services`) | `crew-host.ts` | `fake-crew-host.ts` |
| `PermissionRules` | The session rules of the host's permission gate: add, clear, list (the `permissions` service, `ctx.services`) | `permission-rules.ts` | `fake-permission-rules.ts` |
| `Llm` | The model: `act` (the tool loop), `complete`, `extract` (`ctx.llm` of the running agent), `effortSent` (what an act sends for its effort, `ctx.llm.reasoning`); a failed `act` or `complete` throws an `LlmFailure` | `llm.ts` | `fake-llm.ts` |
| `RunState` | The running agent's own state, for one crew run (`ctx.state`) | `run-state.ts` | `fake-run-state.ts` |
| `CrewMemory` | The running crew's key/value memory, shared by its agents for one run (`ctx.memory.crew`) | `crew-memory.ts` | `fake-crew-memory.ts` |
| `Clock` | The current time (`ports/clock.ts`), the one read of the clock outside `shared/infrastructure/` | `wiring.ts` (`orkeonClock()`) | `fake-clock.ts` |
| `Logger` | The command's or the crew's log | none: `ctx.log` is passed as is | `fake-logger.ts` |

What the table leaves out:

- **`DecisionModel`**, what it is for:
  - No model, a failed call and an unreadable answer are all `null`, so the caller does what it did without one
    (`system_one_decide`, registered when the settings configure a decision provider, whichever it is).

### Wiring

- `wiring.ts` binds the adapters that read the `tools` global (`orkeonShell()`, `orkeonFiles()`, `orkeonProgress()`,
  `orkeonTelemetry()`, `orkeonMemoryStore()`, `orkeonCodeIndex()`, `orkeonDecisionModel()`, `orkeonToolCalls()`, the
  calls of a crew by a name its command found, and `orkeonToolCatalogue(ctx.services)`, which a handler builds, as
  the registered names come from its context) and the services built on them (`orkeonConfigStore()`,
  `orkeonSessionIo()`).
- The adapters of what the context carries are built by the entry point from the context it receives:
  `createLlm(ctx.llm)`, `createRunState(ctx)`, `createCrewMemory(ctx)`, `createCrewHost(ctx.services)` and
  `createPermissionRules(ctx.services)` (an async command hands the last two to `launchCrew` or `launchMainLoop`
  with its log).
- Every adapter takes the runtime object as a parameter, so its own test runs it over a stand-in: `fake-tools.ts`
  (the `tools` global), `fake-llm-facade.ts` (`ctx.llm`), `fake-agent-context.ts` (`ctx.state`, `ctx.memory`),
  `fake-script-host.ts` (the script-host service), `fake-permissions-facade.ts` (the permissions service).
- `orkeonClock()` is the clock of the runtime code: an entry point hands it to what dates a record or measures a
  wait, where a test hands a `FakeClock`.
- `orkeonCompactionDeps(ctx, ports, clock)` gathers the ports of the compaction pipeline, for `/compact` and the
  main loop's automatic compaction alike.

### Services

The services (`src/shared/application/`) are built over the ports and shared by commands and crews: `session-io.ts`
(the buffer plus the permission mode a session runs in), `config-store.ts` (`/config`: the settings file overridden
by the state bag), `session-state.ts` (JSON values in the state bag), `json-file.ts` (JSON files, guarded against
invalid content), `attached-skills.ts` (the `/skills` registry with each file's content), `permission-rules.ts` (the
session's rules and their sync to the host gate), `extra-tools.ts` (the `tools.extra` setting against the registered
tools) and `compaction/` (the compaction pipeline).

### Rule sets

The rule sets (`src/shared/domain/agent-policy/rule-sets.ts`) are deny rules Orkeon Code ships as data, in the
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

- A use case whose command writes its own output (`/diff`) puts it in the view's `lines` and, for a unified diff, in
  its `diff`, a typed block the console colours: both are written before the table and the message.
- A command that offers a choice takes the `Chooser` port: without an argument, in an interactive console, it opens
  a panel (`/model`, `/effort`, `/output-style`, `/mode`, `/theme`), and on a replay or a plain console it keeps its
  text behaviour.
- An async command starts a crew instead: `dispatch` returns `launchCrew({ crews: createCrewHost(ctx.services), log:
  ctx.log }, "<crew>", input)` (the ticket, from `_lib/dispatch.ts`) and `completed` prints the result with
  `writeCompleted`, as a markdown block the console renders, a failure as a plain line.
- What a program wrote and no model did (`/transcribe`, `/say`, `/memory admit`) goes through `writePlainCompleted`,
  as a line.

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
| `main-loop` | autonomous, budget 200 tool calls / 1800 s / 700k context tokens (the context counted once) | `/assistant`, free text, `/summary`, `/verify`, `/transcribe --then`, `/voice send` and `--go` | The interactive loop |
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
| `agent-run` | sequential, one act of a built-in charter (`dev-reviewer`, `dev-auditor`) | `/tasks send`, `/tasks repair` | A new run of an ended child, its brief carrying the previous report and the operator's message |
| `dev-spec` | sequential, extracts, the review in a background child `dev-reviewer` (ten read tools in `plan`) | `/dev-spec` | Business spec written by code from JSON, its questions asked one at a time through `human_input`, one read-only review |
| `dev-change` | sequential, extracts, the review in a background child `dev-reviewer` (ten read tools in `plan`) | `/dev-spec <code> <kind>` | Bug reproduced or cost measured by running, change brief written by code, questions through `human_input`, one review |
| `dev-implement` | sequential, one agent, two roles in `acceptEdits` (five read tools, six write tools - `file_write` for a new file, the node editors and `edit_batch` for an existing one; the editing rule spells an `edit_batch` out, its `operations` list and `validate`, and the guard's refusal of a batch without operations repeats it; the runtime publishes the schema of the node tools too; every `node_replace` of a batch carries the hash `node_read` gave for that very node, never a guessed one, since a placeholder hash made the runtime refuse a whole batch in a live run - `run_tests`, `run_build`, `memory_recall`) | `/dev-batches <code> F<n>` (`--close` the close alone) | Each cycle (the steps on one test file) red then green, checked by code, its cost measured |
| `dev-batches` | Sequential, one agent with the reviewer's read tools, its review inline (the next batch's review is offered five of them, `file_read`, `node_outline`, `node_read`, `codebase_search` and `glob`, for eight turns: its brief carries the sheet, what the closed batches changed and the plan) | `/dev-batches` (typed again after a stop: the run goes on; every hop of its chain keeps the depth of the instance it runs for, `chain: "continue"`, so a plan of any length closes in one command) | Names a plan's next batch in its dependencies' order, after a review of its sheet once its dependencies closed |
| `shared-memory-admit` | sequential, no tool, no LLM | `/memory admit` | Writes the candidates the operator confirmed to the shared memory's entries, the lists, and re-ingests the index |

### The crews in detail

- **`agent-run`**, what it does:
  - It runs under the step of the instance's run (a reviewer of `/dev-spec` under that step's rule sets, hooks and
    budget), else the charter's step, with that step's budget and no child of its own.
- **`dev-implement`**, what it does:
  - A correction appended as a step.
  - The build and the suite (later the affected projects) as jobs.
  - Then the audit (the `dev-verify` crew) and, on VALID, the commit and the done marks.
  - An assumption is recorded once per batch, never one the sheet already holds.
  - A relative path a role hands a tool is resolved under the checkout before the tool runs.
- **`dev-batches`**, process:
  - With `--concurrency` 2 to 4, one batch agent per batch of a wave (`batch-F<n>`, the implement tools and the
    auditor's read tools, `run_tests`, `run_build`, `run_validation`, `memory_recall`), each under its worktree's
    working root.
- **`dev-batches`**, what it does:
  - Logs each batch in `batches-state.md`.
  - Sequential, the command's `completed` drives `/dev-batches`, each close committed without a push.
  - In parallel, the driver seeds each worktree, runs the wave's batch agents at once (each runs the steps, the
    audit inline and the close in code, bounded by its own tool calls), then merges each VALID batch fast-forward in
    id order, brings its files back and removes its worktree.
  - One push and one pull request at the plan's close.
  - A review that cannot run (no reviewer on the host, an answer that does not parse twice, a refused call) stops
    the batch before its launch, logged `BLOCKED — review not run (<reason>)`, and the next run reviews it again (a
    stop for Blocking questions is settled by the human and not reviewed twice).
  - Each Major row of the review ends the RED and GREEN prompts of that batch as a `stale: <question> — <evidence>`
    line, on its first launch only.
  - A GAPS verdict relaunches the batch by itself, in its worktree in parallel, its Blocking and Major rows as the
    correction (none for an audit the budget stopped, whose resume then runs), up to three audit rounds in GAPS
    since the last VALID, an audit the budget stopped counted as one.
  - The third still GAPS goes to a human.

A folder starting with `_` holds a development probe (`probe.ork.ts`), never a command's crew: `_probe-shared-memory`
measures the shared memory's recall on a reference set, run by `scripts/check-shared-memory.sh` before a release.

## Where text lives

The natural-language text of `src/` lives apart from the logic that uses it
([ADR 0026](adr/0026-text-isolation.md)), in up to three text files per layer folder, beside the modules that read
them:

| File | Holds | Read by |
| --- | --- | --- |
| `prompts.ts` | what a model reads: system prompts, instructions, tool descriptions | the module that builds the call |
| `messages.ts` | what the user reads: usage, refusals, errors, status and report lines, hints | the module that renders or throws |
| `markers.ts` | what a writer and a reader share: headings, verdict words, regular expressions over text | the writer and the parser |

- A text file sits in the layer of its reader (`domain/`, `application/`, `shared/infrastructure/orkeon/`,
  `commands/_lib/<group>/`): a domain module reads text from `domain/` only. The text of a `*.cmd.ts` goes to
  `commands/_lib/<group>/messages.ts`, that of a `crew.ork.ts` to `crews/<crew>/application/messages.ts`.
- A text with values in it is a function of those values, named after what it says. A text file past about 400 lines
  may become a folder `prompts/<subject>.ts`.
- Text files are TypeScript: the bundle loads no other kind of file.
- What stays inline: identifiers, configuration keys, paths, shell commands, flags, the keys of a JSON schema, short
  enumeration words, and the `description:` of a `*.cmd.ts`. The charters (`*-charter.ts`, `built-in-charters.ts`),
  `design-rules.ts` and `reading-rule.ts` are text files under their own names.
- A text file holds text only: constants and template functions (parameters in, text out; a ternary, an early return,
  a `.map` or a `.join` to render a list). An `async` function, `await`, a loop, a `switch`, a `try`, a class, a
  `let` or a `var`, and a value imported from a module that is neither a text file nor a domain module are logic: the
  budget of a brief, a cut, a choice of what to carry go to a logic module beside the text file
  (`crews/main-loop/application/turn-context.ts` beside `prompts.ts`). A type may be imported from anywhere.
- `tests/repository/text-isolation.test.ts` checks both sides, reading `src/` once: it flags a literal of a logic
  file that holds three words or more, or more than 60 characters with a space, and a construct of logic in a text
  file; each exception is named with its file, its owner and its reason.
