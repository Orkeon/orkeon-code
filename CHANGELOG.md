# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`/tasks` lists the approvals the background tasks wait on** (Orkeon #198, delivered by #206): under the task
  list, `waiting for approval:` then one line per approval, `t1 dev-batches: waits for approval of shell_command ·
  {"command":…}`, read from the host's `approvals` service; a host without it shows none. A task blocked on the
  operator reads as such under the list, where only its "running" row showed before ([Permissions](docs/permissions.md#modes), #15).
- **An installed `orkeon-code`.** `install.sh` and `install.ps1` install it from a release (the checksum is checked
  when the release has one), `npm install -g orkeon-code@next` installs the npm package and its command shim, and
  `orkeon-code --version` names Code's version, where it runs from, and the Orkeon expected and found. An install
  never reads a `config/appsettings.local.json` (the settings it reads are below), and keeps each project's state
  under `ORKEON_CODE_HOME/projects/<name>-<hash>/` and its demo repository in `demo/` (default `~/.orkeon-code`); a
  clone keeps its state in `.crew-output/` and its demo in `fixtures/`
  ([Getting started](docs/getting-started.md), [Configuration](docs/configuration.md#launcher-environment)).
- **The user's own settings**: the `orkeonCode` block of the settings file the launcher reads. The launcher copies
  the block alone, never the `Llm` section, to `<state>/user-config/config.json` at each start and mounts it
  read-only on `/user-config`, in every mode; `/config list` shows its values as `[user]`
  ([Permissions](docs/permissions.md#what-a-project-file-may-set)).
- **`/commit` commits a file list and can push**: it stages the changed files, or the paths named, by name (`git add
  -- <files>`, never `-A`), leaves the work folder (`dev.workDir`) out unless a path inside it is named, checks
  git's identity first, and refuses while a merge or a cherry-pick is in progress. `--push` pushes the branch
  (`git push -u origin <branch>`) and `--pr` pushes it too; after either, or under the new key `dev.prAuto`, the pull
  request body is written under `<work>/pr-<slug>/PR.md` and the pull request opened, or its `gh pr create` command
  printed, as described below ([Configuration](docs/configuration.md#session-settings)).
- **The tools of Orkeon #180 in the catalogue.** Read: `glob`, `grep`, `count_pattern`, `list_mounts`,
  `node_outline`, `node_read` and the graph queries (`access_cost`, `affected_tests`, `batch_anchors`,
  `documented_in`, `documents_of`, `structural_search`, `incremental_reindex`, `statement_query`,
  `complexity_report`). Edit: `edit_file`, `node_replace`, `node_insert`, `node_ensure`, `edit_batch`,
  `structural_rewrite`, and `github` and `rag_eval`, which declare no access and are asked in `acceptEdits` too. A
  rule may name `spawn_agent`, which the host offers to every act; `/permissions` warns on an allow rule on it.
- **Rule sets over the new tools**: `read-noise` covers every tool that reads one `path`, `secrets` the written text
  of every editing tool, `state-files` the `path` of every tool that writes one file. `structural_rewrite`, whose
  paths the gate cannot read, is denied whole; `edit_batch` is checked operation by operation by the crews' callback,
  as the editor each operation stands for, every `validate` but "parse" refused, and an import's `name` and `module`
  read by `secrets`. A dev step holds 534 rules, 536 with the two allows of `/dev-implement`.
- **`Orkeon:Tools:ResultLimits` and `Llm:MaxRateLimitWait` in the example settings**: the cut of a tool's result per
  tool (10,000 characters for `shell_command`), four read calls of a turn at once, and a rate-limit wait of five
  minutes ([Configuration](docs/configuration.md)).

- **Rule sets for the dev steps**: `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement` and `/dev-verify` (except
  `--gate-only`) now put five sets of deny rules in the permission gate before their crew starts. `git-readonly`
  refuses git commands that change the repository, also behind a path, an `env`, a chain or `-C`.
  `inline-interpreters` refuses `bash -c`, `node -e` and the like. `read-noise` refuses reads under `bin/`, `obj/`,
  `.git/` and `node_modules/`. `secrets` refuses written content holding a private key or a token with a known prefix.
  `state-files` refuses writes to the batch logs, verdicts, captures, `.orkeon/` and `.claude/`. The sets are not
  stored with the session's rules. `/permissions` shows them grouped while they stay in the gate, until the next
  `/assistant` turn or rule change. The steps now **refuse to start when the host says its permission gate is off**
  (`/dev-plan` warned before), and warn on a host that keeps no session rules, where the crew's callback alone checks
  the sets.
- **`/dev-spec <code> [<brief> | <path>.md | <request>]`**: a business spec written by code from the model's JSON
  (template sections 1-12, § 13 Decisions), its open questions asked one at a time through `human_input` - Blocking
  first, the recommended option first, each answer written to the file before the next question - then folded into
  the body; one read-only review whose Blocking rows are asked too. Unattended, the questions stay in the file and the
  step reads `BLOCKED`, never a default answer. An existing spec is revised, its decisions kept.
- **`/dev-change <code> bug|refactor|perf [--run "<command>"] [<#issue | path | text>]`**: a change brief; a bug is
  reproduced by running a narrow test command of the pack (or the CLI) before anything is written and stops when it
  does not fail, a perf change is measured, the output kept in `repro-<code>.txt`; an issue is read by
  `gh issue view`; a request that is a feature is sent to `/dev-spec`; a pin the code index does not show reads
  `unpinned`. Questions, fold and review as `/dev-spec`.
- **`/dev-plan [<code> | <path>/SPEC-<code>.md | <path>/CHANGE-<code>.md] [--replace]`**: plans a settled spec or
  change brief as batches. A Blocking row in the source's open questions stops it at once, before any crew starts,
  with the rows and the command that settles them. Otherwise an inventory of the existing code is drawn from the code
  index, the model answers once with the plan as JSON, and code renders `<work>/<code>/<CODE>-PLAN.md`, one
  `<CODE>-PLAN-F<n>.md` sheet per batch and `plan.json`, in the format the harness reads, so its own commands take
  the files as they are. A read-only reviewer (plan mode, nine read tools, `structural_search` among them) then questions the plan: its Major rows
  go under the batch they target, a Blocking row marks the plan blocked. An existing plan is refused; `--replace`
  writes over it only while no batch is done and nothing is ticked, and never with fewer batches than before, since
  a stale sheet cannot be removed for you. Pack keys that are missing (`commands.build_test`, `commands.test_project`,
  `commands.test_integration`) are named in a warning, to fill in the plan or the pack. The next step is printed:
  `/dev-implement F1`, and with two batches or more `/dev-batches <code>` too. A run, with the index build,
  two model calls and a review of up to 20 turns, may outlast the REPL's script time limit of 5 minutes: the example
  settings' 30 minutes (`Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout`) leave room for it.
- **`/dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr]`**: runs one batch sheet test-first. For
  each open step, the test author writes the step's red tests (test files, and signature stubs of the production
  files the step's Anchors marks `to create`) and the implementer the least code that turns them green (test files
  read-only), two acts of one agent, each with its own tools and its own deny rules. Consecutive steps on one test
  file run as one cycle: every red test first, then one GREEN and one Cost for them all. Code writes the briefs from
  the sheet and the pack, looks at the tree before and after each act, runs the narrow test command itself, measures
  the access cost of the production lines the cycle added (`access_cost` over the code index), and ticks `RED`,
  `GREEN` and `COST` only once it saw what each box stands for: a production file written before a red test, a test
  green at once or green with no file changed, a test file changed while turning it green, or a port call in a loop,
  stated or measured, stops the batch with `BLOCKED`, nothing ticked past it. A role's `Assumption:` lines land under
  the sheet's `## Assumptions`, to be validated by the user. A run resumes at the first open step. The pack's restore
  runs once; the build and the whole suite (the projects the run touched, once the suite went green for the batch)
  then run as shell jobs, looked at every 20 s for an hour at most, their logs under `<work>/<code>/logs/`
  (`F<n>-build.txt`, `F<n>-test.txt`, `F<n>-test-affected.txt`), where `/dev-verify` reads them. A batch all ticked
  and green goes on to `/dev-verify` (`resume` after a GAPS verdict), and a VALID verdict to the close: on the default
  branch with `contrib.branch` it creates `<prefix>/<code>-f<n>`, the files the roles changed are committed by name,
  pushed, the pull request opened or handed over, and the sheet and the plan's batch marked done. `--close` runs the
  close alone. `F<n> — correction: <finding>` appends an audit's gap to the sheet as a new step, then runs it; a finding
  that names an id the sheet does not carry is sent to `/dev-change` or `/dev-plan`. The repository pack's
  `layout.test_files` names test files that sit beside the code.
- **`/dev-learn [<axis>] [--list] | --accept <id>[,<id>…] | --refuse <id | motif text>`**: learns from the audits.
  It reads the Blocking and Major rows of the `GAPS` sections of every `<CODE>-VERIFY-F<n>.md` in the work folder,
  keeps those not treated yet, and per axis asks the model, in one call, to group them into motifs; a motif must
  span three batches or more, which code checks. The proposals land in `<work>/learn-<date>/PROPOSALS.md`.
  `--list` prints the untreated gaps per axis, or the rows of one axis, with no model call and no write. `--accept`
  marks a motif's gaps treated and prints the change to make (for a harness file, the patch for the orkeon-workshop
  repository); it edits no file. `--refuse` records the motif in `refused.md` under `memory.dir` (`.orkeon/memory/` by
  default), which later runs leave out. The harness's own learning state is read, never written: the gaps it treated and the motifs it refused are
  honoured, and a gap's id is the same as the harness's. A run makes up to six model calls (three axes, one retry
  each), which may outlast the REPL's script time limit of 5 minutes: the example settings' 30 minutes
  (`Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout`) leave room for it.
- **`/dev-verify F<n> [<code> | <path>/<CODE>-PLAN.md] [fast | full | resume] [--gate-only]`**: audits one batch of
  a dev plan. A gate first checks the sheet's TDD ticks, the design ids, the scope, the test traits and whitespace,
  and prints the same ok/FAIL lines as the harness's gate; a red gate stops there. On a green gate the command writes
  a capture under `<work>/<code>/capture-F<n>/` (status, diffs, build, traits, last test run, test classes and a
  mechanical table), runs the whole suite under `full`, and hands the batch to a read-only auditor (plan mode, five
  read tools) whose narrow test commands code runs for it. The verdict lands in `<CODE>-VERIFY-F<n>.md`, in the
  format the harness reads back; `resume` appends a dated section. `--gate-only` runs the gate alone, with no
  model call and no write. It commits nothing; the close of `/dev-implement` does, after a VALID verdict. A `full` run
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
- **`/permissions` says whether the host gate is on**: on, or OFF with a warning that no rule and no mode is
  enforced; the runtime always reports it (Orkeon #128). The main loop
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
- **Hooks that fire.** In the dev steps (`/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-verify`,
  `/dev-batches`, and the agent `/tasks repair` starts again),
  each `pre-tool` hook of `/hooks` runs before a tool call of the model the host gate allowed, and the first that
  fails refuses the call; each `post-tool` hook runs after it, and one that fails adds a line to the result the model
  reads. `{tool}`, `{event}` and `{path}` in the command are replaced by the call's; a hook is one program and its
  arguments, as the shell tool runs it, so `/hooks add` refuses a command holding a shell operator. The assistant does
  not run them yet, and nothing runs a `stop` hook ([Hooks](docs/hooks.md)).
- **The dev crews' tool callback.** After the host gate allowed a call, the crews of the dev steps check it again: the
  step's rule sets (their only check under `orkeon run`, which keeps no session rules), `glob`, `grep` and
  `count_pattern` by their whole input, a path as written and normalised (`./`, `//`, `..`), and, when the host has no
  gate, the act's mode. It refuses with the rule, its set and what to do instead; it never allows a call the gate
  refused. A role of a batch adds its roots ([Permissions](docs/permissions.md)).
- The dev steps' own tools: `run_validation` lets the `/dev-verify` auditor run up to three narrow test commands of
  the repository pack itself, and the verdict cites each run; `run_tests` and `run_build` serve the writing roles of
  `/dev-implement`, each command checked against the pack, the integration and restore rules and the step's rules
  before it runs, its whole output in a log file.
- `/dev-verify` measures the access cost of a batch: it refreshes the batch's changed files in the code index
  (`incremental_reindex`), runs `access_cost` over them and prints the `Cost:` line under the gate; a port call or an
  in-memory filter in a loop or a lambda on an added line makes the capture's Cost row a gap. Without a `/workspace`
  index it says `not indexed` (run `/analyze` first). The pack's `tools.access_cost.roots` choose the files (else every changed
  file but the tests) and its `receivers` add to the runtime's port names.
- The main loop runs two chains of checks around each turn: at its start (a guard may refuse the turn or add context
  lines, stored as a `[turn-context]` message before the request) and on its answer (a blank answer, or one without
  the closing line its command names, goes back to the model once with the reason).
- A compaction (automatic or `/compact`) first writes the state of the dev batch in progress to
  `.orkeon/dev/<code>/state-F<n>.md` — the sheet's TDD lines and the first open step, the batch's events, the
  reports recorded, `git status --short` — from files and git only, then points at it in the new buffer
  (`[restored-state]`); `/dev-verify F<n>` records the batch in progress. The outcome line names the file.
- The first turn of a session carries what the session's start script printed (`Orkeon:Cli:Session:StartScript`):
  `scripts/session-start.ork.ts`, which the launchers install, names the recent state files and the open batches
  (`scripts/session-start.sh` prints the same lines in a terminal).
- `scripts/dev-run.sh <crew> <code> --inputs '<json>'` chains the steps of a dev crew headless, one `orkeon run` per step, each output
  in `.orkeon/dev/<code>/runs/`, until the event log says closed (0), a human decides (3), nothing moved (4) or
  `--max-steps` is reached (5); a rate-limited step is run again after `--wait` seconds. The dev crews do not append
  to that log themselves, so name one the steps move (`--log`), or the chain stops after its first step. It refuses the crew `dev-batches` (exit 64): a whole plan without anyone at
  the keyboard stays the REPL's `/dev-batches` ([Autonomous and embedded runs](docs/headless.md)).
- `/status` names the Orkeon runtime it runs on (the `.orkeon-version` pin) and the host's LLM provider.
- `/usage` and `/context` show the prompt-cache tokens read and written (`cacheRead`, `cacheWrite`), summed over the
  session's models from `session_stats`; `-` when the host reports none.
- `/commit --pr` (and `dev.prAuto` after a push) opens the pull request itself with the runtime's `github` tool
  (`create_pr`) when the host offers it, origin is on github.com, the base branch is known and the session allows it:
  an allow rule `allow github action=create_pr`, `bypassPermissions`, or a yes to the `/commit` plan that named the
  pull request; otherwise it prints the `gh pr create` command and says why.
- Folder trust: the first start in a folder asks whether you trust it, before anything of it is read or mounted;
  `y` stores it in `~/.orkeon-code/trusted-folders.json` and every folder below it starts without asking. Without a
  terminal an untrusted folder is refused with exit code 3 unless `--trust` is given (this run only) or
  `ORKEON_CODE_TRUST=1` with `CI=true`. `orkeon-code trust list | add | remove | check` manage the store;
  `scripts/run-crew.sh` checks the same way.
- Settings: `~/.orkeon-code/appsettings.json` is the user's settings file; `~/.config/orkeon-code/appsettings.json` is
  still read, with a warning naming the new place; with neither, Orkeon's own `~/.config/Orkeon/appsettings.json`
  (`orkeon init`) is used and the REPL reads it itself. `orkeon-code setup` writes the file (mode 600) from an example,
  asking the model and the name of the key's variable, never the key; it runs by itself on a first start in a
  terminal with no settings.

- **The shared memory** ([Shared memory](docs/shared-memory.md)): admitted decisions, code structures, methods and
  mistakes kept under `memory.dir` (default `.orkeon/memory`), one file per entry, indexed in the collection
  `memory-<project>`. Nothing is admitted without the operator: `memory_push` writes candidates,
  `/memory-admit` asks once per candidate (a headless session admits nothing; `memory.autoAdmitAudited` admits an
  audited one unasked), `--refuse` keeps a topic out for good. `memory.dir`, `memory.project` and
  `memory.autoAdmitAudited` are new settings; a project file's `memory.autoAdmitAudited true` needs the user's.
- **`memory_recall` and `memory_push`**, Orkeon Code's own tools in the REPL's turns: the recall reads, in every
  mode; the push writes a candidate file, offered only where the mode edits, asked in `default`
  ([Permissions](docs/permissions.md#modes)). Both are ruleable on their arguments (`deny memory_push topic=auth*`).
  The agents of the dev steps, and their children, are given `memory_recall` too, never `memory_push`, and none
  when a session rule denies every call of it.
- **Sub-agents as background children.** The adversarial reviews of `/dev-spec`, `/dev-change` and `/dev-plan` and
  the audit of `/dev-verify` run in a child agent of their crew (`ctx.spawnBackground`), read-only, with the charter's tools; the step's own agent
  keeps the extraction and falls back to the act inline on a host without background children. `/tasks` lists the
  children while they run and after (`show <id>`), stops a running one (`stop <id>`), and answers a send to an
  ended one by a new run of its charter (`send <id> <message>`, `repair <id> [note]`: crew `agent-run`, whose brief
  carries the previous report). A send to a running child is refused. `/agents` lists the two built-in charters.
- **`/effort` reaches the provider.** The level `/effort` stored is sent as the act's `effort` (provider thinking)
  by `/assistant`, `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-verify` and `/dev-batches` (the
  audit `/dev-implement` chains too) and their children; an unset level sends none. The log of the act
  says `act — effort: <level>`.
- `/dev-learn` asks, after `PROPOSALS.md` is written, one multi-select per axis: the motifs picked are accepted, the
  others refused, as `--accept`/`--refuse` do; "Decide later", nothing selected or nobody answering decides nothing.
- `/dev-plan` and its Blocking stop name `/dev-spec` and `/dev-change` as Orkeon Code's own steps.
- Sessions are kept per project, outside it: `orkeon-code` starts fresh and moves the last session to the project's
  history, `--continue` (`-c`) brings back the session you quit, `--resume` lists the saved ones and brings one back
  (`--resume <number or id>` without asking); the newest 50 are kept (`ORKEON_CODE_SESSIONS_KEEP`).
- `/resume` lists this project's saved sessions and says how to bring one back.
- `/doctor` warns when an older start left sessions in the project's `.orkeon/sessions`.
- `/dev-batches [<code>] [--pr]` runs a plan's batches one at a time, in the order their dependencies allow: each
  batch goes through `/dev-implement`'s chain (red tests, the least code, the audit, on VALID a commit not
  pushed); the run logs each batch in `.orkeon/dev/<code>/batches-state.md`, reviews a batch whose dependencies
  just closed before its first launch, stops on BLOCKED, GAPS or a Blocking review question, and closes the plan
  with one push and one pull request. Typed again (or `/dev-batches` alone after the runtime's chain limit), it
  goes on from the first batch not done; a batch's close, typed or chained, never pushes while the run is in
  progress. The start scripts name `/dev-batches <code>` beside an open batch.
- `/dev-batches` takes `--concurrency <n>`, 1 to 4: 1, the default, is the run above. Above 1, each run takes the
  next wave of open batches whose anchors are disjoint and runs them at once, each in a batch agent under the working
  root of its own worktree (`.orkeon/worktrees/<code>-F<n>`, branch `batches/<code>/F<n>`, made with
  `git worktree add --relative-paths`, git 2.48 or later): its steps, its audit inline and its close, committed there
  and never pushed. The driver seeds each worktree with the work folder, the dev state, the config, the packs and the
  shared memory, then merges each VALID batch fast-forward into the work branch in id order, brings back what the batch
  changed of its sheet, verdict, capture and logs (`F<n>-run_tests-1.log`), never over a file the checkout changed
  since, and removes the worktree; a batch that stops (GAPS, BLOCKED, its tool calls spent, a merge refused) keeps its
  worktree, its code, sheet and verdict there alone, and the run names the command that relaunches it there
  (`/dev-batches <code> --concurrency <n>`, a GAPS verdict's correction first); a run one at a time refuses such a
  batch. Typed again without `--concurrency`, the run goes on as it was; `--concurrency 1` goes back to one at a time.
  The next wave chains itself, and the plan's close still pushes once. Above 1 needs `bypassPermissions`, git working
  in a worktree under the shell confinement (a first probe checks it; under Bubblewrap, a runtime that binds a linked
  worktree's git dir, Orkeon/orkeon#191) and all of `.orkeon/` ignored by git (`.gitignore` or `.git/info/exclude`);
  each batch runs under its own budget of tool calls, wall time and tokens (`crew.runAgent`'s `budget`,
  Orkeon/orkeon#189), its tool calls also counted in code so that it ends saying what is left. `state-files` refuses
  the entries of `.orkeon/` one by one, all but `worktrees/`, so a batch writes its code in its worktree. A pack whose `layout.tests` is also a source root is reported when read (both roles
  would be refused that folder: tests beside the code take `layout.test_files`). A batch's audit that writes no verdict says
  why (its last line), and a stub a RED of a `/dev-implement` cycle wrote stays open to the cycle's later REDs, a
  rerun's too, until its GREEN. A Cost line whose `none` gives its reason (`none — no loop over a port call`) is
  no longer taken for a port call in a loop. The ports of the dev crews are built from the calling
  agent's own tools, and a batch keeps naming the checkout `/workspace`, rebased on its root (Orkeon/orkeon#186,
  delivered by #187).
- The dev steps recall the shared memory on their own: `/dev-spec` and `/dev-change` at the start (decisions,
  methods), `/dev-plan` before the plan (decisions, code structure), `/dev-implement` before each batch's red tests
  (code structures, mistakes) and on a correction (mistakes), `/dev-verify` before the audit (mistakes); the end of
  the step names the entries recalled.
- `/dev-verify` harvests mistake candidates from the audits after a verdict that is not VALID (a gap recurring in
  three batches), for `/memory-admit` to decide, and says `/dev-learn` is due once untreated gaps span two batches.
- `scripts/check-shared-memory.sh`: a live check of the shared memory's recall before a release (reference set of
  12 entries and 14 questions, recall@5 >= 0.85, MRR >= 0.70).
- **`/memory-admit --import`.** It lifts the harness's agent memory into the shared memory's candidates: each
  top-level entry of a `.claude/agent-memory/<agent>/MEMORY.md` (with the note it links to) becomes a `method`
  candidate that `/memory-admit` then asks about; an entry whose topic a candidate, an entry or an earlier entry
  already holds writes nothing, so a second import adds nothing. Nothing is written under `.claude/`.

### Changed

- **The interactive turn's token budget is 1.5M, and the assistant reads a file by range.** The runtime sums the
  prompt and completion of every call of a turn, so a turn pays its whole context again at each call: 400k ended a
  turn of 17 file reads and one shell command in 43 s (`Token budget exhausted (425303/400000)`), its work lost.
  The main-loop crew's budget is 1.5M tokens, and its header tells the model to read by range, a hundred lines or
  so, the next range only when needed, and why ([Configuration](docs/configuration.md#settings-orkeon-code-relies-on)).
- **The editing rule of the dev roles pins every hash of an `edit_batch`**: each `node_replace` of the batch carries
  the sha256 `node_read` gave for that very node, read first, never guessed. In the live run of 2026-10-27 a test
  author sent a batch whose second operation carried the hash `PLACEHOLDER`: the runtime refused the whole batch and
  a turn went to reading the node ([Architecture](docs/architecture.md#crews)).
- **A dev role may hand a tool a relative path as shown** (Orkeon #199 and #200, delivered by #206): the runtime
  resolves it against the agent's root, else `/workspace`, so the reading rule of the dev roles no longer says "never
  as written"; it says where such a path is read and that either form goes. The tool-call hook keeps resolving it
  before the guard and the hooks ([ADR 0005](docs/adr/0005-orkeon-after-206.md)).
- **The speech server needs Python 3.11 or later** (`mcp/whisper/pyproject.toml`, `requires-python = ">=3.11"`).
  Python 3.10 reached its end of life in October 2026, and the `filelock` that huggingface-hub pulls in is fixed
  of six advisories (GHSA-v4x8-3wr5-3wq8 and five others on its lock files) from 4.2.1 on, a version that needs
  3.11. The lock resolves `filelock` 4.2.4 and drops the packages the 3.10 fork alone pulled in; `uv` downloads
  a Python when the distribution has none ([speech server](mcp/whisper/README.md), [WSL tutorial](docs/wsl-tutorial.md)).
- **The slash commands sit in functional folders**: `src/commands/<group>/` (`session`, `settings`, `status`, `project`,
  `git`, `dev`, `memory`, `speech`), and [Slash commands](docs/commands.md) lists them by group.
- **Every test of `src/` sits next to its module**, the command use cases of `commands/_lib/` included (they were the
  `tests/commands-<family>.test.ts` files). `tests/` keeps the tests of the repository as a whole, by subject:
  `repository/` (the dependency rule, the test shape, the command surface, the prompt contract, the versions),
  `scripts/` (the scripts, the launchers, the install) and `config/` (the example settings)
  ([Architecture](docs/architecture.md#layers-and-the-dependency-rule)).
- **A background command's approval is answered from the main view** (Orkeon #194, delivered by #195): the question
  names its task (`approve <tool> for [t1]? …`) and shows on the status line and on the task's row. `/permissions`,
  [Permissions](docs/permissions.md) and [Getting started](docs/getting-started.md) say so (#15).
- **A tool name the act does not offer is refused without a question** (Orkeon #193, delivered by #195): the runtime
  answers `ERROR: tool '<name>' is not available to this agent.` before the gate and before the dev crews' callback,
  so such a call no longer waits on an approval nor counts against a batch's tool calls. The system texts of the dev
  roles, the auditor and the reviewer say that only their tools exist and to go back to them on that error (#14).
- **The search routing follows the thirteen Tree-sitter adapters of Orkeon #195.** A question on a `.js`, `.jsx`,
  `.mjs`, `.cjs`, `.java`, `.c`, `.h`, `.cpp` (and `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`), `.php`, `.rb`, `.sh` or
  `.bash` file goes to `codebase_search`, `symbol_source` and `flow_trace`, no longer to `rag_search`, which held
  nothing for it; HTML, JSON and CSS, parsed by the structural tools but in no index, stay on `rag_search` (#13).
- **A project's `.orkeon/config.json` no longer widens what the user allows.** Its `permissions.fallback` applies
  only as `default`, `plan` or `acceptEdits`, never wider than the user settings' mode; its `tools.extra` offers only
  the tools the user settings list too (`*` lists them all). `/permissions` names what is set aside (`↳ ignored`),
  and `/config set` of such a value still writes it, then says it is ignored and where the user setting goes.
  **Upgrade:** a project that set `permissions.fallback` to `bypassPermissions` or `dontAsk`, or listed tools in
  `tools.extra`, in `.orkeon/config.json` loses them until you copy them into the `orkeonCode` block of your user
  settings file ([Permissions](docs/permissions.md#what-a-project-file-may-set)).
- **The release archives are renamed**: `orkeon-code-<version>.tar.gz` and `.zip` are now the runnable archive, and
  the source archives are `orkeon-code-<version>-source.*`.
- **`/doctor` reads the `access` of the mounts** from the host.
- **`/dev-verify` detects a cut output by the runtime's notice** (`[... truncated, N chars omitted. …]`, 10,000
  characters for the shell).
- **`/dev-plan` takes its callers from `batch_anchors`**, tests included.
- **An extra tool may no longer bear the name of a new built-in tool** (`glob`, `github`…): it is refused at launch,
  in the start report.
- **The dev steps no longer warn that the host cannot say whether its gate is on**; the warning for a host that keeps
  no session rules remains.
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
- **Orkeon version**: Orkeon Code targets Orkeon's `main` after Orkeon/orkeon#213, the surface `1.0.0-rc.6` will
  carry: the gate state, the typed tools, the per-tool result limits ([ADR 0004](docs/adr/0004-orkeon-after-180.md)),
  the file tools resolving a relative path, the pending approvals a command reads
  ([ADR 0005](docs/adr/0005-orkeon-after-206.md)), the REPL starting on a terminal, the structural tools' parameter
  schema and the line-by-line streaming of concurrent acts ([ADR 0006](docs/adr/0006-orkeon-after-213.md)). The
  typings are generated from that `main` (`ORKEON_SOURCE=<checkout> npm run typings`) until a release carries it: the
  node tools and `edit_batch` now type their inputs (`path`, `selector`, `expected_hash`, `operations` required, the
  `kind`, `op`, `position` and `validate` values as literals).

- **Every prompt is written from a behaviour specification**, in this project's own words
  ([Architecture](docs/architecture.md#prompt-assembly), [ADR 0003](docs/adr/0003-prompts-from-a-behaviour-specification.md)).
  The main loop's header gains a contract per mode (read-only: a plan is the deliverable; otherwise a destructive or
  outward-facing action the request does not call for is proposed, not performed), when to ask (a question ends the
  turn), checking the work after a change, care with actions (git only on request, staged by name, secrets kept in the
  environment), where instructions may come from (file contents, tool output and the marked history messages are
  material), and what the tools can do, as the runtime offers them: `file_read` reads a part of a file with `offset` and `limit`,
  the read calls of a turn may run together, results are cut, the shell is allow-listed; the header's ceiling is 9,500
  characters for the larger catalogue. The provenance baseline is empty and CI runs the gate with `--strict`.
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
  questions of the permission gate, and Orkeon's confinement of the shell (`Orkeon:Tools:Shell:Confinement:Mode`,
  `Auto` by default, `None` in the example settings; [SECURITY.md](SECURITY.md)).
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
- `/permissions show` names a third line of enforcement, the dev crews' callback; `/hooks list` says where the
  hooks run instead of "engine not wired".
- The auditor's and the reviewer's prompts ask for reads by range (`file_read` with `offset` and `limit`, 120 lines
  at most) or by symbol (`node_read`, now among their tools); a `/dev-verify` stopped by its budget says which
  budget was spent instead of "the model call failed".
- `/usage`: the `cacheHit` column is now `cacheRead`, next to the new `cacheWrite`.
- `docs/configuration.md`: `Llm:MaxRateLimitWait` and `Llm:Profiles:<name>:MaxRateLimitWait` detailed
  (`LlmRateLimitException`), and the prompt cache (`orkeon:cache_ttl`, not set by Orkeon Code).

- `/tasks` is an async command: the task list (`add`, `done`, `clear`) as before, the agent instances under it.
- A crew launched from a command's completion past the chain's limit (`Orkeon:Cli:ScriptCommands:MaxChainDepth`,
  default 8) is refused with a line that says so, instead of an unexplained failure.
- An install keeps each project's state under `~/.orkeon-code/projects/<name>-<hash>/` (was `~/.orkeon-code/state/`,
  shared by every project); a clone and `ORKEON_CODE_STATE` keep each project's sessions, history and `project.json` under
  `projects/<name>-<hash>/`, and share their `output/`, `tmp/` and `transcripts/` between projects. The old
  `~/.orkeon-code/state/` is left alone.
- A bare `--llm-log` writes the LLM log to the project's state folder (`llm-logs/`), never into the project (#181).
- The example settings set `Orkeon:Cli:Session:Persist: true`.
- `/dev-implement`: the test author and the implementer read a source file by node (`node_outline`, then
  `node_read`) and change it with `node_replace`, `node_insert`, `node_ensure` or one `edit_batch` (`validate`
  "parse", all or nothing); `file_write` on an existing file under the pack's source roots is refused (the rewrite
  rule), a new file is still created with it. After the batch the touched files are refreshed in the code index
  (`index: <n> files of F<n> refreshed`), and on a later run the graph's `affected_tests` adds its test projects to
  the sheet's, or runs the whole suite when it reaches every test (the per-operation check of `edit_batch`: Rule sets
  over the new tools, above).
- The reviewer of `/dev-spec`, `/dev-change`, `/dev-plan` and `/dev-batches` also holds `node_outline` and
  `structural_search`, and its prompt sends a search for a code pattern to `structural_search` rather than grep.
- `/dev-plan` ends on `/dev-implement F1 <plan>`, and with two batches or more on `/dev-batches <code>` too (it named
  the harness's `/dev-batches` with the batch ids, a form Orkeon Code's command refuses).

### Removed

- **The probe crews `_probe-codeintel`, `_probe-raggable` and `_probe-budget`**: what they established is recorded in
  [Architecture](docs/architecture.md#what-the-probes-established).

- **`/tag`** (a `/memory add` under another name), **`/sandbox-toggle`** (it recorded a setting nothing enforced),
  **`/onboarding`** (the REPL's native `/help` lists every command), **`/bughunter`** (now `/review --lens
  correctness`) and **`/force-snip`** (now `/compact --snip`).

### Fixed

- **`/analyze` indexes a project that holds a shell script.** `index_codebase` failed on the first `.sh` with `File
  extension '.sh' is not allowed`: the runtime's path validator blocks `.sh`, `.bash`, `.ps1`, `.bat` and `.cmd` for
  reading too, and its discovery fails the whole index on one refused file. The index is now asked for every grammar
  of the runtime's registry but bash (`shared/domain/index-languages.ts`): the scripts stay out of the index, and
  `file_read` on one stays refused, until the runtime reads them ([known issues](docs/roadmap.md#known-issues), Orkeon #215).
- **`orkeon-code --version` names the runtime of the mode forced** by `--mode` or `ORKEON_CODE_MODE`: `source checkout
  <path>` in source mode, the image in docker mode, where it followed the auto-detection order and said "docker mode"
  on a machine with Docker whatever the mode asked. Without a forced mode, the detection order speaks as before.
- **Three runtime defects of the live runs of 2026-10-26 are closed by Orkeon #213**, the commit the source mode and the
  CI smoke now build (`ORKEON_SOURCE_REF`): the interactive REPL starts on a terminal again, TUI and `--ui plain`,
  where it hung after its start lines on the `main` after #206 (Orkeon #212); with `/dev-batches --concurrency` above
  1 the streamed answers of the parallel batches no longer interleave character by character, each line comes whole
  and prefixed by its ticket (Orkeon #211); the node tools and `edit_batch` publish their parameter schema to the
  model, which guessed `node_outline` without a `path` and `edit_batch` without `operations` from the description
  alone (Orkeon #210). The editing rule keeps spelling the `edit_batch` shape out, so that the guard's refusal repeats
  it ([known issues](docs/roadmap.md#known-issues)).
- `/dev-batches`, `/dev-plan`, `/dev-spec`, `/dev-change`: a review row whose target carries a qualifier (`F2 (step 1)`)
  is kept under the batch's id instead of being refused, which made the extraction retry and then lose the whole
  review (live run of 2026-10-26: `review of F2: not run (unparsable)`, a Major question never shown); the
  extraction prompt names the ids a target may be, and the reviewer is asked for a batch by its id.
- `/dev-implement`, `/dev-batches`: the editing rule of the roles spells an `edit_batch` out (its `operations` list and
  `validate`), which the runtime's tool schema does not publish: two calls without `operations` were refused in the
  live run of 2026-10-26 before the model recovered from the refusal's hint; the rule and the hint share one text.
- `/dev-verify`, `/dev-batches`: the audit's brief and the next batch's review brief list the project's files (tracked
  and untracked, the work folder left out), and the auditor and the reviewer never read a name they guessed nor a
  folder: a live run spent ten reads on modules that did not exist.
- `/dev-implement`, `/dev-batches`: a relative path a role hands a tool (`src/a.js`) is resolved under the checkout,
  or the batch's worktree, before the tool runs, instead of the runtime's "No mount found" refusal; an assumption
  the sheet already holds is not recorded again by the next role.
- `/dev-verify`, `/dev-implement`, `/dev-batches`: the auditor no longer puts a Major Reuse row on an operator of the
  language written where a one-line helper exists (`a + b` beside `add(a, b)`): a Reuse row names a helper whose body
  does more than one operator, else the row is Minor at most and the verdict stays VALID.
- `/dev-plan`, `/dev-spec`, `/dev-change`, `/dev-batches`: a review's row is never refused for a `|` or a line break in its question or evidence (a `\` then the `|` are escaped, the break becomes a space), and its evidence may cite a section by its heading (`§ TDD sequence`), not only by number. Before, a reviewer quoting a design row of the sheet, then citing a heading it read from its brief, had its review refused twice and marked not run.
- `/dev-batches`: the next batch's review brief carries the plan too, after the sheet and the closed batches' diffs, says that the files to review are in the brief (not "read each by section"), and the reviewer's focus names what stays closed: the spec, the closed batches' sheets and the repository's configuration. Before, the reviewer opened the plan, the spec, two sheets, `package.json`, `repo.yaml` and the check script before reading its brief.
- `/dev-implement`: a RED brief whose test file is carried says the file exists (an earlier step wrote the one the sheet says is to create) and asks the test author to add to it by node without reading it again; a GREEN brief says the test file is in the brief. Before, the second step of a batch read its own test file three times after being told it was to create.
- `/dev-implement`: the GREEN brief carries the production files of its steps after the test files, and says that a
  file the sheet says is to create exists once RED stubbed it. Before, the implementer globbed the tree and read the
  stub again (four turns of the fourth live run).
- `/dev-implement`: RED may add a signature stub to an existing production file of its step, for a declaration the
  new tests import and the module lacks, and its brief says that a whole test file failing on that import is not the
  red asked. Before, the test author worked around the missing export with a second, namespace import.
- `/dev-implement`, `/dev-batches`: a brief says a file is in it only when it carries the file whole, by its path (a
  text cut or left out for want of room is no longer announced as in the brief); it compared titles before.
- `/dev-implement`: the `run_tests` result lists the failed tests the output names (TAP `not ok`, pytest `FAILED`, dotnet `Failed … [ms]`, go `--- FAIL`, jest and vitest), at most 20, and the RED brief says so. Before, the test author opened the run's log (one or two turns per step) to see which tests failed.
- `/dev-plan`, `/dev-spec`, `/dev-change`, `/dev-batches`: a review's verdict follows its rows (GAPS with one, CLEAR with none), whatever word the review opened with. Before, a review that began "CLEAR — no, two questions" was extracted as CLEAR with two rows and refused twice, so the next batch's review counted as not run.
- `/dev-batches`: the review of the next batch gets its material in its brief: the batch's sheet, then what each closed batch it depends on changed (`git show` of its commit), up to 18 000 characters, each cut with a note past that room. The reviewer is told that the decisions the sheet and the plan record are settled, so that it asks only what a closed batch's change opened; it is offered four read tools (`file_read`, `node_outline`, `node_read`, `codebase_search`) and eight turns instead of nine and twenty. Before, its brief named the sheet and the closed batches' files, and the reviewer opened the plan folder, the tree, the captures and the logs file by file: on the L-8 live run, 15 turns and 255 000 prompt tokens, a third of the run, for two questions about the sheet's own design.
- `/dev-implement`: the whitespace `git diff --check` refuses is put right by code in the files a role changed, right after its act: trailing spaces or tabs, blank lines at the end of a file (a node insert after a module's last member leaves one). The step says `whitespace ✓ — <file>: …`. Before, the gate stopped the batch for it (`GATE — batch F3: RED`), and the batches run summarised that stop by the gate's last line alone; it now adds the checks that failed, in parentheses.
- `/dev-implement`: the test author's and the implementer's briefs carry the sheet and the step's test file when it exists (12 000 characters at most, cut with a note), under a section that says not to open them. Before, each role opened the sheet section by section, the test file and the project's files before its first edit: on the L-8 live run, 3 to 6 reading turns of 6 to 11 per role and step.
- `/dev-verify` and `/dev-batches`: the audit's brief carries the sheet (up to 6 000 characters) and the capture's texts, up to 12 000 characters, and lists only the files past that room to read. The auditor is told that the spec, the plan, the repository's configuration and the modules the diff leaves untouched stay closed, and gets 12 turns. Before that, it opens no other batch's sheet and none of the repository's tool settings unless a row rests on one, asks for several reads in one turn, and got 16 turns instead of 30. Before, it opened the dozen capture files one by one, each turn sending the whole conversation again; on the L-8 live run the audits made up about half the prompt tokens.
- `/dev-implement`: a batch's build and whole suite are looked at after 1 s, then after a wait twice as long each time, up to 20 s. Before, the first look came 20 s after the start, so a suite of one second cost about 21 s, twice per batch.
- `/dev-implement`: an agent's `Assumption: none needed` (or `n/a`, `nothing`) no longer becomes a row of the sheet's assumptions, nor of the pull request's.
- `/dev-batches`: a batch's audit is offered only the auditor's tools: its five read tools, `run_validation` and `memory_recall`. Before, it was offered the batch agent's whole catalogue, the implementer's write tools included, which put 19 tool schemas into every turn of the auditor.
- `/dev-verify` and `/dev-implement`: less noise in the pull request.
  - The traits row is settled as not applicable when the pack carries ids in no trait; it was a Not run line on every batch.
  - The auditor writes no row for a check that found nothing.
  - The dev agents record an assumption only for a behaviour the plan leaves open, never for a test value or a stub's wording.
- `/dev-batches`: a close whose push fails names the command to push from a terminal, since a confined shell reaches no remote. The next run takes a branch already on origin as pushed and closes without pushing again.
- `/dev-verify`: the auditor knows that steps on one test file run as one cycle, all their REDs and then one GREEN. A GREEN box ticked for the cycle's first step is no longer reported as a state the code never held.
- `/dev-batches`: under a Bubblewrap shell, the preflight's missing git identity names `git config user.name` and `user.email` in the repository. That shell runs with `HOME=/tmp` and a cleared environment, so a `--global` setting does not reach it.
- **The audit capture lists a JavaScript batch's changed files.** `test-classes.txt` took only `.cs`, `.ts`, `.py`,
  `.fs` and `.vb` for source files and wrote "no changed source file" for a `.js` batch; it now takes the code index's
  languages too. The auditor no longer reports the global plan's open line of the batch it audits, marked after the
  audit, nor the assumptions left to the user, which the pull request lists.
- **The documentation says what the runtime and the code do, and the wave-7 audit's findings are fixed.**
  - Documentation: the main loop's wall time stops while the gate waits for your answer; the read calls of a turn
    run up to `MaxParallelToolCalls` at once; the shell's confinement defaults to `Auto` (bubblewrap on Linux,
    Seatbelt on macOS, AppContainer on Windows, none inside a container), the examples setting `None`; `http_api`
    declares an execute; hooks run in every dev step, `/dev-batches` and `/tasks repair` included; `/permissions`
    never reads the gate as unknown on the targeted runtime; the auditor has five read tools; `/effort` reaches every
    dev step; `scripts/run-crew.sh` runs in source mode before rc.6 is published, reads no user settings, and
    `release.yml`'s runnable archives, installers and npm job are described. Getting started lists what the dev
    workflow writes in a project and every mount, the commit message of a linked worktree included; the README
    presents the dev workflow, the shared memory and the installers; the roadmap drops what is delivered, records the
    structural-editor parts still waiting, and keeps the pull-request question of `/commit` a command prompt.
    `/agents` names the verbs its usage line takes, and the steps that run the reviewer (`/dev-spec`, `/dev-change`,
    `/dev-plan`).
  - Security and permissions: in the rule sets of a dev step, `git-readonly`
    218 (the reads of `git config` - `--get`, `--get-regexp`, `--list`, `-l`, a bare key, on any `--file` - run; its
    writes stay refused, a key then a value and a changing option behind another one by the crews' code, in a
    subshell, a group, a substitution or an `eval` too, which a glob cannot tell from `--file a.cfg --list`), `inline-interpreters` 28 (a versioned `python3.12 -c`, and an option before `-c` or `-e`: `python3 -I
    -c`, `perl -w -e`, `ruby -w -e`; a `-c` after a script, `python3 x.py -c`, runs), `read-noise` 64 (`directory_search` among the path read tools), `state-files`
    41, `secrets` 128. A pilot kept out of the source roots is refused `structural_search` and `symbol_source`
    whole. The shell check of the dev crews and of the step guards reads the command as the host does - quotes
    dropped, blanks and tabs joined, backslash escapes resolved, option clusters split (`git "push"`, `bash  -c`,
    `python3 -Ic`, `git pu\sh`) - and a relative path that climbs out and back as the project path; a plan source
    spelt with `.` or `//` segments is checked as the path it names. The shared memory's guard: in every mode, the
    file tools of the model that name one path are refused under `<memory.dir>/candidates/` and `entries/`, and a shell
    command naming `<memory.dir>/candidates` or `/entries`; the callback of the main loop and of every dev crew,
    under `orkeon run` too, refuses what the gate cannot read: a path in another letter case, each `edit_batch`
    operation, a `structural_rewrite` that writes, a shell command reaching the folder segment by segment in any
    case (`cd .orkeon/memory && … > entries/x`, `.orkeon//memory/entries`; a glob such as `mem*` is not read). A stored allow it
    covers is dropped with a warning, and `/permissions` lists it. `dev.prAuto` from a
    project file is narrowed as `memory.autoAdmitAudited` is, and an invalid `tools.extra` project entry naming a
    tool the file also declares validly is dropped. `memory.dir` is refused under `.claude/` or `.git/` in any
    letter case; a multi-line front-matter field is joined on one line; `/memory-admit --import` refuses an item
    holding a secret anywhere, before its note is cut; a `memory_push` whose candidate a concurrent push overwrote
    writes it again under the next id.
  - Dev steps: the review of `/dev-spec` and `/dev-change` runs in a background child `dev-reviewer`, as
    `/dev-plan`'s, which `/tasks` lists and stops (inline on a host without background children). `/dev-spec`,
    `/dev-change`, `/dev-plan`, `/dev-implement` and `/dev-batches` refuse in a read-only mode, an unknown mode, and
    when the mode cannot be read. Budgets have one source: `/dev-verify` 700 000 tokens, `/dev-plan` 840 000 (240
    calls of 3 500, its reviewer child inside), `/dev-spec` and `/dev-change` 700 000 (200 calls, their reviewer child inside) with one level of children;
    a `/tasks repair` (crew `agent-run`) runs under the step of the instance's run - its rule sets, hooks and
    budget, with no child of its own - else the charter's step (was 300 000 tokens). `/dev-plan`: an anchor spelt
    `./a/b` or `a//b` is checked as the path it names and one holding a `\` is refused; an anchor in a folder
    listing 1000 entries or more is said "not checked"; a prompt that leaves no room for the inventory refuses,
    nothing written. `/dev-change`: an evidence command naming a path out of the checkout through an option
    (`-o/etc/x`, `--dir=..`, `out=../x`, `-C~`) is refused; a symbol is known by its exact name, path or basename,
    or by its last segment when the name also names its file (`Bank.AccountTests.X`), never when another class
    holds it. `/dev-spec`, `/dev-change`: a write that fails says "could not be written (<reason>)", and
    another error (a cancelled question) is no longer reported as one. `/dev-verify`: a validation the gate ran red
    is a Blocking Test row, so a VALID answer over a red run is GAPS; a verdict file left empty resumes the whole
    batch; a plan path outside the work folder is refused; a cancelled audit says `the audit was cancelled`; a
    budget spent while the answer is extracted reads as the spent budget; `run_validation "x \"y\""` and
    `run_validation(command="...")` are read as the command. `/dev-implement`: a rerun after a BLOCKED cycle runs
    the suite once before the first new RED, and its baseline leaves out the red tests the BLOCKED step's own RED
    wrote (the count each RED tick records in `<batch>-red-failures.json` of the run's log folder); the affected tests are asked with paths relative to the indexed root;
    the graph's projects no command can name are said; the index is refreshed before the build; `--close` chains on
    the VALID line of the batch it wrote only. `/dev-batches`: the launch line carries `audits <n>`; a batch whose
    close was refused at the chain's depth limit is relaunched when its audit did not run; a `/dev-batches` typed
    while a chain may still close a batch (an audit since its launch says VALID, no commit yet) logs nothing and
    names the close as the way out. `/dev-learn`: two motifs
    over the same rows are refused; "Decide later", or nothing selected, decides nothing; it and `--refuse` read and
    write `refused.md` under `memory.dir`, the file `/memory-admit` and `memory_push` read.
  - Git and launchers: `/commit` and the dev close work in a linked worktree (the message goes under
    `.orkeon/ORKEON_COMMITMSG`, removed after, and a removal that fails is said with the commit); a pull-request body that cannot be written is said, never thrown
    after the push; `/dev-batches` refuses a second plan while a run is in progress (a record whose run's log ends `closed`
    no longer counts), takes a batch committed but
    not marked done for done, and refuses the plan's close on the default branch when the pack sets
    `contrib.branch`; `orkeon-code.ps1` passes `-it` only on a terminal and `--user` on Linux, refuses an unknown
    mode, has `--help`, and says `--demo` is bash-only; `install.ps1 -Uninstall` never removes a git clone;
    `session-start.sh` picks state files by their header date, as its twin; `run-crew.sh`'s source mode says when
    `dotnet` is missing; `scripts/dev-run.sh` refuses the crew `dev-batches`, checks the trust once before the
    first step and creates nothing in the project before it and runs each step with its standard input on `/dev/null`; the CI npm-shim step passes `--trust`.
  - Commands: `/doctor` shows a `version` row first and a row `settings: project file` - "widens nothing", or a WARN
    naming every key the project file set and that was ignored (`permissions.fallback`, `tools.extra`,
    `memory.autoAdmitAudited`, `dev.prAuto`); `/stats` has a `cacheWrite` column and its `cacheHit` is now
    `cacheRead`; `/hooks` and `/permissions` name every step that runs the hooks and the rule sets; `/memory-admit`
    keeps the admissions already confirmed when a question is left unanswered and says which candidates stay;
    `/tasks` lists the children of `/dev-spec` and `/dev-change`, and settles as dead an open run whose `updatedAt`
    does not parse; the main loop keeps a non-blank first answer, with a warning, when a stop-check retry throws.
    Dead exports are un-exported or removed, `hasExplicitConfirm` of `/commit` among them (`parseCommitArgs` reads
    the flag).
- `/dev-verify`: an audit the step's budget stops still writes its verdict, `GAPS` with one Blocking row that says the
  audit did not finish and why, and the validations that ran before; the step's token budget is 700 000 (a live audit
  of a 3-file batch spent 307 528 of the former 300 000). Its resume takes the gaps of the last audit that finished, or
  audits the whole batch when none did, and the stopped audit counts as no round of GAPS. A validation the auditor names wrapped in the tool's name
  (`run_validation "<command>"`) is read as the command alone.
- A pre-tool hook whose command line the runtime's mount check refuses (an argument naming a mount its program may not
  write) is reported as that refusal, no longer as the hook refusing the call.
- The dev agents are told that a path shown relative goes to a tool as `/workspace/<path>`.
- `scripts/run-crew.sh` passes `ORKEON_CODE_MODEL` (as `Llm:Model`) and, with `ORKEON_CODE_MODE=source`, runs the tool
  built from `ORKEON_SOURCE` with the same settings and mounts; `scripts/dev-run.sh`'s `DEV_RUN_RUNNER` gets neither.
- A known key written nested in `.orkeon/config.json` or the user settings (`{"permissions": {"fallback": …}}`)
  is read by nothing: `/config list` and `/permissions` now name it with its flat spelling (`"permissions.fallback"`).
- `docs/headless.md`: a run whose calls the gate refused still exits `0` (the refusal is the tool's result), and a
  project file no longer sets `bypassPermissions`.
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
  10 minutes of wall time, on a clock that then kept running while a question waited for you (Orkeon #127 since stops it), and a turn failed with
  `Wall time exceeded (0:15:55 >= 0:10:00)`: it allows 30 minutes. Configuration says which limit is whose.
- **The source mode works on a project that pins another SDK.** It ran `dotnet run` from the project, whose
  `global.json` the SDK then read ("A compatible .NET SDK was not found"): it builds in the Orkeon checkout and runs
  the built assembly from the project with `dotnet <dll>`, which reads no `global.json`.
- `orkeon-code.ps1` left the variables it sets for the REPL (`ORKEON_ALLOW_EXTERNAL_MOUNTS`, the gate, esbuild, the
  model) in the PowerShell session that ran it: it puts them back when it ends, and removes one that was not set
  (set back empty, it reached the next run: an empty `whisper` server among them).
- An unreadable file or session is reported with the tool's own message, every line of it, without the runtime's
  wrapping (`/resume`, the extraTools notice): a file the runtime says is not found on a second line is read as
  absent again.

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
