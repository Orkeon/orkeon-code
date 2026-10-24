# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The tools of Orkeon #180 in the catalogue.** Read: `glob`, `grep`, `count_pattern`, `list_mounts`,
  `node_outline`, `node_read` and the graph queries (`access_cost`, `affected_tests`, `batch_anchors`,
  `documented_in`, `documents_of`, `structural_search`, `incremental_reindex`, `statement_query`,
  `complexity_report`). Edit: `edit_file`, `node_replace`, `node_insert`, `node_ensure`, `edit_batch`,
  `structural_rewrite`, and `github` and `rag_eval`, which declare no access and are asked in `acceptEdits` too. A
  rule may name `spawn_agent`, which the host offers to every act; `/permissions` warns on an allow rule on it.
- **Rule sets over the new tools**: `read-noise` covers every tool that reads one `path`, `secrets` the written text
  of every editing tool, `state-files` the `path` of every tool that writes one file; `edit_batch` and
  `structural_rewrite`, whose paths the gate cannot read, are denied whole. A dev step holds 407 rules.
- **`Orkeon:Tools:ResultLimits` and `Llm:MaxRateLimitWait` in the example settings**: the cut of a tool's result per
  tool (10,000 characters for `shell_command`), four read calls of a turn at once, and a rate-limit wait of five
  minutes ([Configuration](docs/configuration.md)).

- **Rule sets for the dev steps**: `/dev-verify` (except `--gate-only`) and `/dev-plan` now put five sets of deny
  rules in the permission gate before their crew starts. `git-readonly` refuses git commands that change the
  repository, also behind a path, an `env`, a chain or `-C`. `inline-interpreters` refuses `bash -c`, `node -e` and
  the like. `read-noise` refuses reads under `bin/`, `obj/`, `.git/` and `node_modules/`. `secrets` refuses written
  content holding a private key or a token with a known prefix. `state-files` refuses writes to the batch logs, verdicts, captures, `.orkeon/` and
  `.claude/`. The sets are not stored with the session's rules. `/permissions` shows them grouped while they stay in
  the gate, until the next `/assistant` turn or rule change. Both steps now **refuse to start when the host says its
  permission gate is off** (`/dev-plan` warned before), and warn when the host cannot say.
- **`/dev-plan [<code> | <path>/SPEC-<code>.md | <path>/CHANGE-<code>.md] [--replace]`**: plans a settled spec or
  change brief as batches. A Blocking row in the source's open questions stops it at once, before any crew starts,
  with the rows and the command that settles them. Otherwise an inventory of the existing code is drawn from the code
  index, the model answers once with the plan as JSON, and code renders `<work>/<code>/<CODE>-PLAN.md`, one
  `<CODE>-PLAN-F<n>.md` sheet per batch and `plan.json`, in the format the harness reads, so its own commands take
  the files as they are. A read-only reviewer (plan mode, six read tools) then questions the plan: its Major rows
  go under the batch they target, a Blocking row marks the plan blocked. An existing plan is refused; `--replace`
  writes over it only while no batch is done and nothing is ticked, and never with fewer batches than before, since
  a stale sheet cannot be removed for you. Pack keys that are missing (`commands.build_test`, `commands.test_project`,
  `commands.test_integration`) are named in a warning, to fill in the plan or the pack. The next step is printed as
  the harness's `/dev-implement` (or `/dev-batches`) until Orkeon Code ships its own. A run, with the index build,
  two model calls and a review of up to 20 turns, may outlast the REPL's script time limit of 5 minutes: the example
  settings' 30 minutes (`Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout`) leave room for it.
- **`/dev-learn [<axis>] [--list] | --accept <id>[,<id>…] | --refuse <id | motif text>`**: learns from the audits.
  It reads the Blocking and Major rows of the `GAPS` sections of every `<CODE>-VERIFY-F<n>.md` in the work folder,
  keeps those not treated yet, and per axis asks the model, in one call, to group them into motifs; a motif must
  span three batches or more, which code checks. The proposals land in `<work>/learn-<date>/PROPOSALS.md`.
  `--list` prints the untreated gaps per axis, or the rows of one axis, with no model call and no write. `--accept`
  marks a motif's gaps treated and prints the change to make (for a harness file, the patch for the orkeon-workshop
  repository); it edits no file. `--refuse` records the motif in `.orkeon/memory/refused.md`, which later runs leave
  out. The harness's own learning state is read, never written: the gaps it treated and the motifs it refused are
  honoured, and a gap's id is the same as the harness's. A run makes up to six model calls (three axes, one retry
  each), which may outlast the REPL's script time limit of 5 minutes: the example settings' 30 minutes
  (`Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout`) leave room for it.
- **`/dev-verify F<n> [<code> | <path>/<CODE>-PLAN.md] [fast | full | resume] [--gate-only]`**: audits one batch of
  a dev plan. A gate first checks the sheet's TDD ticks, the design ids, the scope, the test traits and whitespace,
  and prints the same ok/FAIL lines as the harness's gate; a red gate stops there. On a green gate the command writes
  a capture under `<work>/<code>/capture-F<n>/` (status, diffs, build, traits, last test run, test classes and a
  mechanical table), runs the whole suite under `full`, and hands the batch to a read-only auditor (plan mode, four
  read tools) whose narrow test commands code runs for it. The verdict lands in `<CODE>-VERIFY-F<n>.md`, in the
  format the harness reads back; `resume` appends a dated section. `--gate-only` runs the gate alone, with no
  model call and no write. It does not commit or push yet, and the access cost is not computed yet. A `full` run
  can take about an hour at worst (build 900 s, whole suite 900 s, three validations of 300 s each, plus the model's
  time), past the REPL's script time limit (`Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout`, 5 minutes by
  default, 30 minutes in the example settings): raise it to 60 minutes or more before a `full` run. A test names the
  sheet id it covers with the pack's `tests.rule_trait`, or with `tests.trait_pattern`, an Orkeon Code key
  (Configuration, Session settings). The words `fast`, `full` and `resume` are modes: a code spelt so is named by its plan path.
- **`/dev-status [<code>]`**: where a piece of dev work stands, read from the harness files (`<CODE>-PLAN.md`,
  the batch sheets, `<CODE>-VERIFY-F<n>.md`): per batch the plan state, the TDD ticks and the last verdict. It shows
  the work folder (`dev.workDir`, then the repository pack's `layout.work`, then `workbench/`) and the repository pack
  (`.orkeon/repo.yaml`, else the harness's), and warns when `.orkeon/` or `workbench/` is not git-ignored. Read-only.
- **[WSL tutorial](docs/wsl-tutorial.md)** (and [in French](docs/fr/wsl-tutorial.md)): Orkeon Code on WSL2 with an
  NVIDIA GPU, step by step with what each step must show: WSLg's audio, Orkeon from its apt package, the speech
  server on the CPU then the GPU, `/transcribe`, `/say` and `/voice`, Kokoro through speaches, and a local language
  model (`qwen3.5:2b` through Ollama, with the context window Ollama must be given), with a troubleshooting table
  and the removal of everything.
- **`config/appsettings.ollama.example.json`**: the example settings on a model of this machine,
  [Ollama](https://ollama.com) serving `qwen3.5:2b`, no key; the same file as `config/appsettings.example.json` but
  for its `Llm` section, with the caveat Ollama's default window of 4,096 tokens puts on an agent whose system prompt
  alone is about 2,250 (`OLLAMA_CONTEXT_LENGTH=16384` on the service). `config/appsettings.ollama-whisper.example.json`
  adds the Whisper server declared in the file, on an NVIDIA GPU with Piper, the microphone and the speaker: the whole
  machine in one settings file. The example-settings tests cover every `config/*.example.json`, and check that a file
  declaring the Whisper server mounts the folders it reads ([Configuration](docs/configuration.md#the-llm)).
- **Documentation in French**: every page of `docs/` has its twin under `docs/fr/`, page for page, with its own
  navigation, published on the site next to the English pages; the ADRs stay in English, and `docs/fr/commands.md`
  is generated with `docs/commands.md`. `npm run check` fails when the two languages drift apart
  (`scripts/check-docs-parity.mjs`: a page without its twin, heading levels, code blocks, table lengths or
  navigation entries that differ).
- **`/permissions` says whether the host gate is on**: on, OFF with a warning that no rule and no mode is enforced,
  or unknown on a runtime that does not expose it (Orkeon `1.0.0-rc.6`; Orkeon #128 added the field). The main loop
  puts the same warning above its answer once per session when the gate is off, except in `bypassPermissions`.
- **Documentation site**: the READMEs and `docs/` are published with docfx to
  <https://orkeon.github.io/orkeon-code/> on every push to `main` (`.github/workflows/docs.yml`,
  `scripts/build-docs-site.sh`); a pull request builds the site, and a broken link or anchor fails it.
- **`/verify [<zone>]`**: the assistant checks the project by running it, following the verification skills
  `/init-verifiers` wrote under `/output/verifiers/` (one zone's, or all of them), and reports as each skill says.
- **`answer.language`**: `/config set answer.language French` makes the assistant answer in that language unless a
  request is written in another one ([Configuration](docs/configuration.md#session-settings)).
- **`compaction.trigger`**: `/config set compaction.trigger 90k` moves the token count at which the automatic
  compaction runs; `/usage` shows it.
- **`/compact <focus>`** names what the summary must keep above all; **`/compact --snip [N]`** only keeps the head
  and the last N exchanges (it replaces `/force-snip`).
- **`/review --lens correctness|security|style`** keeps one lens, outranking the `review.lenses` setting (it replaces
  `/bughunter`).
- **`node scripts/render-prompts.mjs <dir>`** writes every prompt as the model reads it, to review a prompt change as
  a diff; **`tests/prompt-contract.test.ts`** checks the same catalogue (the header identical from turn to turn,
  digit-free and under its ceiling in every mode, no provenance marker, instructions apart from material).

- **Speech output over OpenAI's API or a compatible server**: `TTS_BACKEND=openai` (OpenAI's speech API) or `http`
  (speaches serving Kokoro on a GPU, for instance), the same client as the transcription's backends. A compatible
  server gets a key only when `TTS_API_KEY_VAR` (`WHISPER_API_KEY_VAR` for transcription) names its variable
  ([mcp/whisper/README.md](mcp/whisper/README.md#speech-output)).
- **`voice.reply`**: `/config set voice.reply on` reads every answer of the assistant aloud (`/assistant`, `/summary`,
  `/transcribe --then`, `/voice send` and `--go`: a spoken conversation). The main loop takes an **epilogue**, a call
  the launching command asks it to make with the answer once it is stored; a failure is a warning, never a failed
  turn ([Configuration](docs/configuration.md#speech-output)).
- **`/say [<text>] [--voice] | --stop`** reads a text aloud, or the assistant's last answer with no text, through the
  speech server's new `speak` and `stop_speaking`: the Markdown cleaned off (code and tables skipped), synthesized by
  Piper (the `tts` extra, run as a subprocess, which the launchers add whenever Piper is the backend), played in the
  background. `ORKEON_CODE_VOICE=1` now opens the speaker as well as the microphone. The crew behind `/transcribe`,
  `/voice` and `/say` is renamed `speech` ([Configuration](docs/configuration.md#speech-output)).
- **The Whisper server over HTTP** (`WHISPER_TRANSPORT=http`): Streamable HTTP in JSON-response mode, stateless,
  host-checked, for docker mode, where the server runs on the host and the REPL in the container reaches it with
  Orkeon's `Sse` transport; the server smooths over what that transport sends (no `Accept`, a modern protocol
  probe). Calls are bounded at 100 s by the REPL's HTTP client
  ([mcp/whisper/README.md](mcp/whisper/README.md#docker-mode-the-server-on-the-host)).
- **`/voice`** dictates a request: it records the microphone until a silence and shows the text, `/voice send` sends
  it to the assistant, `/voice --go` sends at once; `--prompt` takes words to spell right, as for `/transcribe`. The
  Whisper server's new `record_and_transcribe` records
  (sounddevice, the `voice` extra) only when the launcher runs with **`ORKEON_CODE_VOICE=1`**; a prelude may now
  make its result the request itself ([Configuration](docs/configuration.md#dictation)).
- **`/transcribe <file> [--lang] [--prompt] [--then "<instruction>"]`** and **`/transcribe --list`**: speech-to-text
  through the Whisper server as the command's call (no question, no `tools.extra` entry), made by a crew, since a
  transcription outlasts the 10 s a command's handler may wait. `--then` runs the instruction on the transcription:
  the main loop takes a **prelude**, a tool call the launching command asks it to make before the turn, whose result
  follows the request in the message the model reads. The vocabulary of `--prompt` reaches faster-whisper as
  `hotwords`, which conditions every 30-second window: on a 16-minute French recording, `initial_prompt` fixed none of
  the proper nouns, `hotwords` all of them ([Configuration](docs/configuration.md#speech-to-text)).
- **`ORKEON_CODE_AUDIO_DIR`** turns speech-to-text on in tool and source modes (tool mode for `orkeon-code.ps1`): both launchers mount the folder on
  `/audio` and `<state>/transcripts` on `/transcripts`, and declare the Whisper server to the REPL through the
  environment, with the extras its backends need (`openai`, `cuda`, `tts`, `voice`) and no settings file to edit;
  `config/appsettings.whisper.example.json` is the same declaration in a settings file, and a settings file or an
  environment that already declares a `whisper` server wins, with a warning
  ([Configuration](docs/configuration.md#speech-to-text)).
- **Speech-to-text MCP server** (`mcp/whisper/`): `transcribe_audio`, `list_audio` and `whisper_info` over stdio on
  faster-whisper, written for Orkeon's MCP client (virtual `/audio` and `/transcripts` paths, inline under 3 500
  characters, parts under 30 000 for `file_read`, the model loaded at the first call), with `openai` and `http`
  backends, unit tests on a fake model and `scripts/whisper-mcp-smoke.sh` on the `tiny` model. On an NVIDIA GPU the
  `cuda` extra is enough: the server preloads its cuBLAS and cuDNN (45 minutes of audio in 95 s with `small` on a
  laptop GPU, against 7 minutes on a CPU) ([mcp/whisper/README.md](mcp/whisper/README.md)).
- **Argument patterns in permission rules**: `/permissions add <deny|allow> <tool> [<argument>=<pattern>]`, `*`
  standing for any run of characters (`/permissions add allow shell_command command=npm test*`). Rules stored in the
  old `effect:tool` form still read. `/permissions` also lists the rules the host gate holds
  ([Permissions](docs/permissions.md)).
- **Tools from MCP servers and plugins**: the session key `tools.extra` names the tools of Orkeon's `MCP:Servers`
  and `Plugins` the assistant may use, each `<name>[:read|:write]` (a write by default). A `read` tool is offered in
  every mode, a `write` tool in `default`, `acceptEdits` and `bypassPermissions`; a name the host does not register is
  left out of the turn with a warning. `/config set` checks the entries, permission rules may name these tools, and
  `/permissions` shows them ([Configuration](docs/configuration.md#extra-tools-mcp-servers-and-plugins)).

### Changed

- **`/doctor` reads the `access` of the mounts** from the host.
- **`/dev-verify` detects a cut output by the runtime's notice** (`[... truncated, N chars omitted. …]`, 10,000
  characters for the shell).
- **`/dev-plan` takes its callers from `batch_anchors`**, tests included.
- **An extra tool may no longer bear the name of a new built-in tool** (`glob`, `github`…): it is refused at launch,
  in the start report.
- **The dev steps no longer warn that the host cannot say whether its gate is on**; the warning for a host that keeps
  no session rules remains.
- **The assistant's header follows the runtime**: `file_read` reads a part of a file with `offset` and `limit`, and
  the read calls of a turn may run together; the header's ceiling is 9,500 characters for the larger catalogue.
- **A root denied to a reading role is denied to `glob`, `grep` and `count_pattern` by its own name too**, not only
  below it; `/mode` names the classes a read-only mode strips, and `/permissions show` withholds `spawn_agent` in the
  read-only modes only.

- **Every built-in tool is typed from the generated typings** (Orkeon #125: `OrkeonBuiltInTools`, input and result
  of each tool from its .NET records). The local copy of their inputs (`CalledTools`) is gone; the stricter shapes
  that remain (`SessionStoreInput`, `MemoryStoreInput`, `ProgressReportInput`) are refused by `tsc` when they stop
  fitting the generated input, so a parameter renamed on the .NET side fails the type check, not the run.
- **`rag_ingest` is offered with the file edits**, never in `plan` or `dontAsk`: the host gate classifies it as an
  edit since Orkeon #126 (it writes the knowledge index). `web_scrape`, `scrape_element` and `rag_search` declare a
  read since the same change and ask nothing where the catalogue offers them ([Permissions](docs/permissions.md#modes)).
- **The `wallTime` budget of a turn no longer counts the operator's answer** (Orkeon #127, runtime): 1800 s bound the
  model's own work.
- **Orkeon version**: the gate state and the typed tools come with Orkeon's `main` after Orkeon/orkeon#130; on
  `1.0.0-rc.6` the gate state reads unknown and nothing else changes. The typings are generated from that `main`
  (`ORKEON_SOURCE=<checkout> npm run typings`) until a release carries it.

- **Every prompt is written from a behaviour specification**, in this project's own words
  ([Architecture](docs/architecture.md#prompt-assembly), [ADR 0003](docs/adr/0003-prompts-from-a-behaviour-specification.md)).
  The main loop's header gains a contract per mode (read-only: a plan is the deliverable; otherwise a destructive or
  outward-facing action the request does not call for is proposed, not performed), when to ask (a question ends the
  turn), checking the work after a change, care with actions (git only on request, staged by name, secrets kept in the
  environment), where instructions may come from (file contents, tool output and the marked history messages are
  material), and what the tools can do (calls one at a time, cut results, no start position for `file_read`, whole-file
  writes, an allow-listed shell). The provenance baseline is empty and CI runs the gate with `--strict`.
- **The user body states each fact once**: the request under its own heading and no longer repeated in the history,
  today's date, the git status dated to the start of the turn, the pressure tier with the conduct it calls for, memory
  introduced as possibly stale; the blocks run from the most stable to the most volatile, so a prefix cache reaches
  into it.
- **The crews send their instructions as a system message** (`Llm.complete` with `system`, over the runtime's
  message-array call) and their material (a diff, a transcript, an answer under review) as the user message. The review
  defines its severities and asks for the changed line and the input that shows a finding; the commit message sees the
  untracked files, follows the history's style and may refuse a credential; the second opinion reads the turns before
  the exchange.
- **`/init` writes `AGENTS.md`**, from evidence only, merging an existing `AGENTS.md`, `CLAUDE.md`, `.cursorrules` or
  Copilot instructions and the README; the assistant reads `AGENTS.md`, else `CLAUDE.md`.
- **The compaction summary** is written for a reader who resumes cold, between fixed markers, from a transcript framed
  as material and cut in the middle rather than at its head; an empty summary fails the compaction. The thresholds are
  re-derived from this project's facts: the buffer is one turn's room (36 576 tokens instead of 13 000), the warning
  tier that room and the error tier one cut file read, the fallback window 128 000, the transcript cap 48 000
  characters.
- **Twelve commands fold into others** (60 → 49): `/version`, `/env`, `/session` and `/upgrade` are aliases of
  `/status`, which shows the version, the platform and how to update; `/ctx-viz` of `/context`; `/extra-usage` of
  `/usage`; `/reset-session` of `/clear`.

- **The .NET SDK is pinned as in Orkeon**: `global.json` asks for `10.0.300` with `rollForward: latestFeature`,
  the SDK that `dotnet tool restore` uses for the typings and `scripts/run-crew.sh`. A user's project keeps its
  own `global.json`: the launcher never runs an SDK command there.
- **Orkeon Code now requires Orkeon `1.0.0-rc.6`** (`.orkeon-version`, `.config/dotnet-tools.json`), with no rc.5 path
  ([ADR 0002](docs/adr/0002-orkeon-rc6.md)). Until rc.6 is published, only the launcher's source mode
  (`ORKEON_SOURCE`, an Orkeon checkout) runs it. The typings come from Orkeon's sources
  (`ORKEON_SOURCE=<checkout> npm run typings`), the crews open with `// @orkeon-script 1.0`, the directive form `tsc`
  reads as a comment, and `npm run typecheck` checks the project as it is.
- **Permissions go through Orkeon's gate.** `/permissions` hands the session's rules to the host's permission gate,
  and `/assistant` and `/summary` hand them again before each turn: a deny refuses a matching call in every mode, an
  allow runs it without asking in every mode but `plan`. In `default` and `acceptEdits` the REPL now asks you about a
  call the mode does not allow outright (`[y] once / [s] session / [n] no`) instead of refusing it. The tool catalogue
  no longer imitates the rules: only a deny that covers every call of a tool removes it, and an allow never adds a
  tool the mode withholds. The launchers turn the gate on (`Orkeon__Security__PermissionGate__Enabled=true`, under
  the settings file).
- **`acceptEdits` offers `shell_command`**: edits run without asking, and the gate asks before each command.
- **The launcher** starts the REPL from the project with `ORKEON_ALLOW_EXTERNAL_MOUNTS=1` in tool and source modes,
  instead of moving to a common parent of the checkout and the project; it no longer raises
  `Orkeon:Cli:ScriptCommands:MaxScripts`, whose default (200) now covers the commands; the tool mode accepts the
  `orkeon-repl` of the Orkeon Debian package, which brings its own esbuild; the docker mode runs the multi-arch
  `orkeon-runners` image (amd64, arm64) of `.orkeon-version`.
- The documentation describes installing `orkeon-repl` with apt or from a self-contained release archive, the
  questions of the permission gate, and Orkeon's opt-in bubblewrap confinement of the shell
  (`Orkeon:Tools:Shell:Confinement:Mode`, [SECURITY.md](SECURITY.md)).
- The sources follow a layered architecture ([Architecture](docs/architecture.md),
  [ADR 0001](docs/adr/0001-clean-architecture.md)):
  - **Ports and adapters.** `src/shared/application/ports.ts` declares what the application needs (`Shell`, `Files`,
    `SessionStore`, `Llm`...); the adapters of `src/shared/infrastructure/orkeon/` are the only code that calls the
    runtime and reads its results, and the entry points (`*.cmd.ts`, `crew.ork.ts`) wire them.
  - **Use cases out of the entry points**: `src/commands/_lib/` (`run<Name>(tokens, deps)`) for the commands,
    `src/crews/<name>/application/run-<crew>.ts` for the crews. The agent policy (permission modes and catalogue,
    behaviour flags, output styles, memory categories) moves to `src/shared/domain/agent-policy/`, with one
    mode-policy table; the session and config services and the compaction pipeline
    (`src/shared/application/compaction/`) run on the ports. The unused `json-extract.ts` is removed.
  - **The dependency rule**: domain imports domain only, application never imports infrastructure nor `commands/`,
    only `src/shared/infrastructure/` and the crew entry points import `globals.ts` or read the runtime globals,
    `commands/_lib/` never imports infrastructure, only a `*.cmd.ts` calls `defineCommand`, and nothing calls
    `require()`. `tests/architecture.test.ts` checks every import and every use of a runtime global.
  - **Test doubles** live in `tests/support/` (`Fake*` classes with plain fields); the commands, the crews' use cases,
    the services and the adapters are tested over them (436 tests before, 745 after).
- The restructuring changes no behaviour, but for readers that now take more of what the runtime may hand back: a
  file read given as a plain string or a `Text` field is read; a telemetry field reported as `null` counts as
  unreported; a session buffer that is not a list reads as empty (the compaction skips it instead of failing), and the
  token counts are numbers for every command; a runtime call that throws at once instead of rejecting is handled
  where the command already handled a failed call; and `ctx.llm.complete` receives an explicit `undefined` second
  argument.

### Removed

- **The probe crews `_probe-codeintel`, `_probe-raggable` and `_probe-budget`**: what they established is recorded in
  [Architecture](docs/architecture.md#what-the-probes-established).

- **`/tag`** (a `/memory add` under another name), **`/sandbox-toggle`** (it recorded a setting nothing enforced),
  **`/onboarding`** (the REPL's native `/help` lists every command), **`/bughunter`** (now `/review --lens
  correctness`) and **`/force-snip`** (now `/compact --snip`).

### Fixed

- **Every turn sent the request twice**: the history ended with it, then the task repeated it.
- **A long conversation lost its recent work in the compaction summary**: the transcript was cut at its head.
- **A file too large to restore after a compaction came back cut**, reading as the whole file; it now comes back as
  its path with a note to read it.
- **`/commit` described changes whose untracked files the model never saw**; a file that usually holds a secret
  (`.env`, a private key) now stops it before any model call.
- **The documentation said the pressure tiers reached the model** (they now do) and placed the compaction prompt and
  the instructions file where they were not.

- **`orkeon-code.ps1` with a one-word `ORKEON_REPL`, or none** (`orkeon-repl` found on the `PATH`): the command was
  read character by character (`o not found`) and the REPL never started; so was a one-word argument of a longer
  `ORKEON_REPL` (`dotnet C:\orkeon\Orkeon.ConsoleApp.dll`).
- **The session's mode shapes the catalogue.** A request without a `mode:` prefix was offered the `default`
  catalogue while the gate applied the session's mode: after `/mode plan`, the model was offered write tools whose
  every call was refused. The launching command now resolves the mode before the crew loads.
- **A failed model call is reported, never stored as an answer.** On Orkeon rc.6 a call the provider failed resolves
  to `<undefined-llm:<error>>`: the turn now fails with the provider's error instead of storing that text as the
  answer, and `/init`, `/init-verifiers`, `/commit` and the compaction summary no longer write it as content.
- `/review`, `/bughunter` and `/security-review` named each lens `[object Object]` in their progress: they name it.
- File listings sent `max_entries`, which `directory_read` ignores: they send `max_results`, so their cap applies.
- `/config keys` named source files that had moved under "read by": it names the commands that read each key.
- **`tools.extra` checks the names the host registers.** It compared the camelCase members of the `tools`
  namespace, so an MCP tool registered as `get-file-contents` or `listIssues` was listed as `get_file_contents` or
  `list_issues`, accepted under that name, and every turn then failed on it (`UnknownToolError`). The names now come
  from the host's `tools` service, compared case-insensitively as Orkeon compares them, and the turn, `/permissions`
  and `/debug-tool-call` use the registered spelling.
- **A stored permission rule is never erased by another change.** A rule on an extra tool that `tools.extra` no
  longer listed (or that a settings file which could not be read hid) stopped parsing, and the next `/permissions
  add`, `remove` or `clear` rewrote the list without it. Every stored entry is now kept as written: such a rule is
  dormant (listed, warned about, not handed to the gate) and applies again once the tool is listed; `remove` deletes
  it. A settings file that cannot be read is reported.
- **Rule patterns and arguments.** One pair of quotes around a pattern is taken off (`command="npm test*"` never
  matched); an argument a built-in tool does not take is refused with the ones it does, and one on an extra tool is
  accepted with a warning. `/permissions` reports every allow rule as without effect in `plan`, whose gate reads none,
  and says that the rules hold only while `Orkeon:Security:PermissionGate:Enabled` is on.
- **An `/assistant` turn gets the time the example settings meant.** The example set `Orkeon:Scripting:Limits`,
  which only `orkeon run` reads: `orkeon-repl` ran its engines under `Orkeon:Cli:ScriptCommands:Limits` (5 minutes,
  64 MB by default), which the example now sets to 30 minutes and 2 GiB. The main-loop crew's own budget allowed
  10 minutes of wall time, on a clock that keeps running while a question waits for you, and a turn failed with
  `Wall time exceeded (0:15:55 >= 0:10:00)`: it allows 30 minutes. Configuration says which limit is whose.
- **The source mode works on a project that pins another SDK.** It ran `dotnet run` from the project, whose
  `global.json` the SDK then read ("A compatible .NET SDK was not found"): it builds in the Orkeon checkout and runs
  the built assembly from the project with `dotnet <dll>`, which reads no `global.json`.
- `orkeon-code.ps1` left the variables it sets for the REPL (`ORKEON_ALLOW_EXTERNAL_MOUNTS`, the gate, esbuild, the
  model) in the PowerShell session that ran it: it puts them back when it ends, and removes one that was not set
  (set back empty, it reached the next run: an empty `whisper` server among them).

## [0.1.0-alpha.1]

First release as a standalone project, on Orkeon `1.0.0-rc.5`.

### Added

- The interactive coding loop (`/assistant`, the `main-loop` crew) under five permission modes, with per-tool
  allow/deny rules and a session-default mode (`/mode`).
- Crews: `project-init` (`/init`), `git-commit` (`/commit`), `code-review` (`/review`, `/bughunter`,
  `/security-review`), `analyze` (`/analyze`), `session-compact` (`/compact`), `init-verifiers`, `advisor`.
- Context management: automatic compaction with a persistent breaker, snip-first `/compact`, file restore after
  compaction, pressure tiers, typed memory.
- 57 slash commands ([docs/commands.md](docs/commands.md)).
- The `orkeon-code` launcher (docker, tool and source modes) and its PowerShell twin.
- The project mascot ([docs/assets/kama-surfer-docker.jpg](docs/assets/kama-surfer-docker.jpg)) in the READMEs and
  the getting-started guide.
- [docs/headless.md](docs/headless.md) (unattended turns, one-shot runs, schedulers and CI, your application) and
  [docs/extending.md](docs/extending.md) (commands, crews, tools, prompts, modes, the limits); the READMEs present
  the three ways to run the crews.
- Checks: unit tests on Node's native type stripping, type check, bundle check with the runtime's esbuild flags,
  provenance gate, runtime smoke.

[Unreleased]: https://github.com/Orkeon/orkeon-code/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/Orkeon/orkeon-code/releases/tag/v0.1.0-alpha.1
