# Configuration

Orkeon Code has no configuration format of its own: the settings file is an Orkeon runtime settings file, read by
the REPL through `--settings`. Start from [`config/appsettings.example.json`](../config/appsettings.example.json).

## Where the settings come from

1. `--settings FILE` on the launcher;
2. `ORKEON_CODE_SETTINGS`;
3. `config/appsettings.local.json` in the checkout (ignored by git), in a clone only: an install never reads it;
4. `~/.orkeon-code/appsettings.json` (`%USERPROFILE%\.orkeon-code\appsettings.json` on Windows; `ORKEON_CODE_HOME`
   moves the folder);
5. `~/.config/orkeon-code/appsettings.json` (`%APPDATA%\orkeon-code\appsettings.json` on Windows), the old place:
   still read, with a warning naming the new one;
6. Orkeon's own `~/.config/Orkeon/appsettings.json` (`%APPDATA%\Orkeon\appsettings.json` on Windows), the file
   `orkeon init` writes. The launcher then passes no `--settings`: the REPL reads it itself (docker mode mounts it,
   the container having no home of yours). An absolute `XDG_CONFIG_HOME` replaces `~/.config` in 5 and 6.

With none of them and a terminal, `orkeon-code setup` runs: it asks the provider (the DeepSeek example or the Ollama
one), the model, and the **name** of the environment variable that holds the key, never the key; it writes
`~/.orkeon-code/appsettings.json`, readable by you alone, and says which variable to export. `orkeon-code setup`
runs it at any time, and asks before replacing an existing file. Without a terminal the launcher stops and names
these choices.

The `orkeonCode` block of that file holds your own session settings, which a project's `.orkeon/config.json` cannot
widen ([what a project file may set](permissions.md#what-a-project-file-may-set)). The launcher copies the block alone,
never the `Llm` section, to `<state>/user-config/config.json` at each start and hands it to the session read-only, on
`/user-config`, in every mode.

Environment variables prefixed `ORKEON_` override the file (`__` separates sections): `ORKEON_Llm__Model`,
`ORKEON_Llm__ApiKey`. `ORKEON_CODE_MODEL` is a launcher shortcut for `ORKEON_Llm__Model`.

## The LLM

| Key | Meaning |
|---|---|
| `Llm:Model` | Model id sent to the endpoint |
| `Llm:BaseUrl` | OpenAI-compatible endpoint (`https://api.deepseek.com`, `https://api.openai.com/v1`, a local server...) |
| `Llm:ApiKeyEnvVar` | Name of the environment variable that holds the key. The key itself never goes in the file |
| `Llm:AvailableModels` | Models `/model` offers to switch to without relaunching |
| `Llm:Temperature`, `Llm:MaxTokens`, `Llm:TimeoutSeconds` | Generation settings |
| `Llm:MaxRateLimitWait` | Longest rate-limit window a call waits out before it fails, `00:05:00` by default. A 429, or a 529 with a reset header, waits until the window the provider announces resets instead of failing the turn; a window longer than this fails the call at once with `LlmRateLimitException`, the wait in its message. `00:00:00` waits for nothing |
| `Llm:Profiles:<name>:MaxRateLimitWait` | The same bound for one named profile of the host, `00:05:00` by default |
| `Llm:Thinking:Enabled` | Reasoning mode, for the providers that have one |

Orkeon recognises the native providers from the endpoint and the model (OpenAI, Anthropic, Gemini, Mistral, DeepSeek,
Z.AI, Moonshot, local servers...): the list and their options are in the
[Orkeon LLM providers documentation](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/llm-providers.md).
An option a provider cannot honour produces a warning, never a silent drop.

**Prompt cache.** A provider that caches the prompt (DeepSeek and OpenAI by themselves, Anthropic with
`cache_control`) reports the tokens read from its cache and written to it; Orkeon keeps them per model and
`/usage`, `/stats` and `/context` show their sum in `cacheRead` and `cacheWrite` (`0` from a provider that reports no cache, `-` from a host that reports no figure). The cache's
lifetime is a per-call option of Orkeon, `orkeon:cache_ttl` (`5m` or `1h`, from an agent's cache setting): Anthropic
honours it, the OpenAI-compatible providers and Ollama log that they cannot. Orkeon Code sets none, so each provider
keeps its own default lifetime.

A model on this machine: [`config/appsettings.ollama.example.json`](../config/appsettings.ollama.example.json) is
the example on [Ollama](https://ollama.com) serving `qwen3.5:2b` (`ollama pull qwen3.5:2b` first), no key and
nothing leaving the machine; Orkeon recognises Ollama by its port, 11434. Ollama serves every model with a window
of 4,096 tokens unless its environment says otherwise, and Orkeon does not widen it per request: the system prompt
of a turn is about 2,250 tokens before the tool schemas and the conversation, so set `OLLAMA_CONTEXT_LENGTH=16384`
on the Ollama service, or the model silently loses its instructions and its tools.

The agent calls tools through every provider: the runtime's tool loop (`ctx.llm.act`) reads the tool calls of the
Anthropic and OpenAI formats, runs the read calls of a model turn up to `MaxParallelToolCalls` at once and the
others one after the other, each call through the permission gate, and sends the results back in the provider's tool protocol. A tool result reaches the model cut at
4000 characters, 32,000 for `file_read`.

## Settings Orkeon Code relies on

| Key | Why |
|---|---|
| `Orkeon:Security:PermissionGate:Enabled` = `true` | The host checks every tool call the model makes against the `/permissions` rules and the mode, and asks you when the mode says so ([what it does not see](permissions.md)). The launcher turns it on unless the settings file says otherwise; without it no call is checked and the modes only shape the catalogue |
| `Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout` | Wall-clock limit of each script engine of `orkeon-repl`: a command's, and a crew's, so an `/assistant` turn's. It stops while a tool call waits for your answer. 5 minutes by default; a turn that indexes a large repository needs more: the example sets 30 minutes. A `/dev-verify full` run can take about an hour (build 900 s, whole suite 900 s, three validations of 300 s each, plus the model's time): set 60 minutes or more for it |
| `Orkeon:Cli:ScriptCommands:Limits:MemoryLimitBytes` | Memory limit of those engines: 64 MB by default, the example sets 2 GiB |
| `Orkeon:Scripting:Limits:ExecutionTimeout`, `Orkeon:Scripting:Limits:MemoryLimitBytes` | The same limits for `orkeon run`, the tool `scripts/run-crew.sh` runs a crew with (30 seconds and 100 MB by default; the example sets 30 minutes and 2 GiB). `orkeon-repl` does not read them |
| `Orkeon:Tools:Shell:AllowInterpreters` | Lets `shell_command` run interpreters (`node`, `dotnet`, `npm`...), needed to build and test most projects |
| `Orkeon:Tools:Shell:ExtraAllowedCommands` | Commands added to the shell allow-list (`make`, `cargo`...) |
| `Orkeon:Tools:Shell:Confinement:Mode` | `Auto` (default: bubblewrap on Linux, Seatbelt on macOS, AppContainer on Windows, none inside a container), `None`, `Bubblewrap`, `Seatbelt` or `AppContainer`. Confined, each shell command runs under `bwrap` (Linux, tool and source modes), network off unless `Confinement:AllowNetwork`, programs outside the system directories listed in `Confinement:ReadOnlyPaths`. A command fails when it cannot be confined. The examples set `None`; a settings file without the key confines, outside a container. `/dev-batches --concurrency` above 1 works under Bubblewrap from a runtime that binds a linked worktree's git dir (Orkeon/orkeon#191); on an older one git fails inside a batch's worktree, and the run refuses itself in one line. Confined, the run's closing push reaches no remote (no network, `HOME=/tmp`, so no credentials): the run stays open with the `git push` command. Push it from a terminal, then the next `/dev-batches` closes the run without pushing again. See [SECURITY.md](../SECURITY.md) |
| `Orkeon:Tools:Shell:Environment:SessionBus` | Whether a confined shell (bubblewrap, Seatbelt, AppContainer) receives the session bus, `DBUS_SESSION_BUS_ADDRESS`, which the keyring credential helper of `gh` needs; `false` by default, since through the bus a command can start a process outside the sandbox. An unconfined shell (`Confinement:Mode` `None`, the example settings) and the code sandbox receive it; `SSH_AUTH_SOCK` and `XDG_RUNTIME_DIR` reach every shell, so git reaches a private remote through the ssh agent (Orkeon #216) |
| `Orkeon:Tools:Shell:Environment:Propagate` | Names of variables added to the shell's allow-list; a name holding a secret word (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `PASS`, `CREDENTIAL`, `AUTH`, `PAT` as a whole segment), starting with `ORKEON_`, or whose value carries URL credentials is dropped with a warning (Orkeon #216) |
| `Orkeon:Tools:ResultLimits:Limits:<tool>` | The cut of a tool's result, in characters: 4000, `file_read` 32000, `node_read` 256000, `shell_command` 10000. A cut result ends with `[... truncated, N chars omitted. …]`; `/dev-verify` reads that notice |
| `Orkeon:Tools:ResultLimits:MaxParallelToolCalls` | The read calls of one model turn that run at once: 4 |
| `Orkeon:Tools:GitHub:Token` | The token of the `github` tool, read once when the tool is registered (Orkeon #222); prefer the variable below to a token written in a settings file, which the examples leave out |
| `Orkeon:Tools:GitHub:TokenVariable` | The environment variable the `github` tool reads its token from when `Token` is unset: `GITHUB_TOKEN` by default, then `GH_TOKEN`. The launcher's Docker mode hands `GITHUB_TOKEN`, `GH_TOKEN` and the variable named here to the container, each when it is set; the native modes inherit the environment. Without a token the tool's description says where to set it; a token shows as `***` in results and logs, and neither key takes a variable reference |
| `Orkeon:Cli:ConsoleStreaming:Enabled` | Streams the answer as it is generated. The example enables it; the answer can be printed twice: off for an unattended run ([known issues](roadmap.md#known-issues)). With `/dev-batches --concurrency` above 1, each batch's streamed answer comes line by line: on the plain console prefixed by its ticket (`[t2] `), the foreground answer alone as it arrives (Orkeon #211); in the TUI on the batch's own screen, without the prefix (Orkeon #217) |
| `Orkeon:Cli:ScriptCommands:MaxScripts` | Commands the loader keeps: 200 by default, above this project's command surface |
| `RateLimiting:*` | Request rate limits towards the provider |

**How long a turn may last.** Two limits bound an `/assistant` turn, and the first one reached ends it:

- the script engine's `ExecutionTimeout` above, which stops while a question waits for you;
- the main-loop crew's own budget, written in its code (`src/crews/main-loop/crew.ork.ts`): 200 tool calls, 1.5M
  tokens (the prompt and completion of every call of the turn, summed: a turn pays its whole context again at each
  call) and 30 minutes of wall time. That clock is Orkeon's and, like the engine's, it stops while the gate waits
  for your answer: only the model's own work counts, and a question left unanswered does not end the turn. When the
  token sum reaches the limit the turn runs no further tool: the model makes one last call without tools, its answer
  is shown under a line saying the turn stopped on its budget, and only a last call that fails or answers nothing
  ends the turn in an error (Orkeon #218); a tool-call or wall-time limit still ends it in an error.

`Orkeon:Cli:ScriptHost:RunCrewTimeout` (10 minutes by default) bounds only a crew a command waits for (`runCrew`);
Orkeon Code starts every crew with `runCrewAsync`, which it does not bound, so the example leaves it out.

## Session settings

Inside the REPL, `/config` lists, reads and writes the session keys (stored in the project's
`.orkeon/config.json`), for example `permissions.fallback` (the mode used when neither a prefix nor `/mode` chose
one), `tools.extra` (below), `voice.reply` ([speech output](#speech-output)), `answer.language` (the language the
assistant answers in, `/config set answer.language French`, unless a request is written in another one),
`compaction.trigger` (the token count at which the automatic compaction runs, `/config set compaction.trigger 90k`;
omitted, the window minus the room one turn needs), `dev.workDir` (the work folder the dev steps read and write, `/dev-status` and `/dev-learn` included,
relative to the checkout, `/config set dev.workDir backstage/tasks`; omitted, the repository pack's `layout.work`, else
`workbench`; `/commit` reads it too, and leaves the work folder out of a commit unless a path inside it is named),
`dev.prAuto` (`true` or `false`, omitted = `false`: `/commit` and the close of a dev step prepare the pull request as
`--pr` does without being asked, its body under `<work>/pr-<slug>/PR.md`, then open it with the runtime's `github` tool
when the host offers it, the session allows it and the tool has a token (`GITHUB_TOKEN`,
[settings](#settings-orkeon-code-relies-on)), else print the `gh pr create` command to type and say why),
`memory.dir` (the [shared memory](shared-memory.md)'s folder, relative to the project, `/config set memory.dir
docs/memory`; omitted, `.orkeon/memory`; never under `.claude/` or `.git/`, never the agent memory's
`.orkeon/agent-memory`), `memory.project` (the project the entries name and the index collection
`memory-<project>`, a kebab-case name; omitted, the `origin` remote's name, else `local`),
`memory.autoAdmitAudited` (`true` or `false`, omitted = `false`: `/memory-admit` admits a candidate an audit backs
without asking), `review.lenses` (the lenses of `/review`, comma-separated among `correctness`, `security` and
`style`; omitted, all three), `advisor.model` (the model of `/advisor`'s second opinion; omitted, the session's own,
which makes it a self-review), `commit.requireConfirm` (`false` lets `/commit` run without its confirmation; omitted =
`true`), or `spinnerVerbs`. `/config keys` lists them all. `/model`, `/effort`, `/passes`, `/fast`, `/proactive` and `/output-style` change
how the next turns run. `/effort` also sets the provider's thinking: the stored level is sent as the act's `effort` by
`/assistant`, every dev step (`/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-verify`, `/dev-batches`)
and the agents these start, and nothing is sent while no level is stored.

`permissions.fallback`, `tools.extra`, `memory.autoAdmitAudited` and `dev.prAuto` set in the project file are narrowed by the `orkeonCode` block of the user
settings (a project `true` over a user `false` or no value is dropped, with a warning): `/config set` writes such a value, then says, under "persisted", that it is ignored and where your own setting
goes, and `/doctor`'s row `settings: project file` names it. `/config set --session` is not narrowed.

At the REPL's start the runtime runs the file its key `Orkeon:Cli:Session:StartScript` names, once, and puts what it
prints before the first request you type. The launcher sets it to `/tmp/orkeon-code/session-start.ork.ts`, a copy of
`scripts/session-start.ork.ts` made at every start: it names the state files of the dev batches a compaction wrote in the
last 7 days (`.orkeon/dev/<code>/state-F<n>.md`, with the first open step) and the batches Code's event log leaves
open. It prints nothing when there is none. Set `Orkeon__Cli__Session__StartScript` to another virtual path to run
your own, or, on Linux and macOS, to an empty value to run none. Make it a `.ork.ts`, which the runtime runs through
its script host: any other file goes to `sh` through `shell_command`, which fails here (`.sh` files are refused, `sh`
is not among the shell's commands, and in tool and source modes the shell reads the host's `/tmp`).
`sh scripts/session-start.sh <project>` prints the same lines in a terminal.

The repository pack (`.orkeon/repo.yaml`, else the harness's) can also give `tests.trait_pattern`, an Orkeon Code key
the harness ignores: how a test names the sheet id it covers, which the gate of `/dev-verify` looks for under the test
roots. It is one line holding `<id>` exactly once and `<name>` at most once; `<name>` stands for `tests.rule_trait`,
which it then needs. At most 80 characters, no tab and no single quote; a run of spaces matches any number of
spaces. Without it, `tests.rule_trait` alone gives the default `[Trait("<name>", "<id>")]`. A Node repository, whose
tests then carry `// rule: BR-01`:

```yaml
tests:
  rule_trait: rule
  trait_pattern: "// <name>: <id>"
```

It can also give `layout.test_files`, another key the harness ignores: the test files that sit beside the code, as
gate patterns (`*` matches any run of characters, `/` included). `/dev-implement` counts a path as a test file when
it lies under `layout.tests` or matches one pattern: the implementer may not write it, the test author may, and a run
needs one of the two keys. A Node repository whose tests sit beside the code:

```yaml
layout:
  domain: src
  test_files: ["src/*.test.ts"]
```

`layout.tests` never names a source root (`tests: src` beside `domain: src`): both roles would be refused that folder,
and reading the pack reports it as an issue (⚠ at the start of `/dev-implement` and `/dev-batches`).

## Extra tools: MCP servers and plugins

The REPL connects the MCP servers of Orkeon's `MCP:Servers` settings and loads the plugins of its `Plugins` section
([Orkeon MCP documentation](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/mcp.md)); their tools join
the host's. The assistant uses one once the session key `tools.extra` names it:

| Key | Value |
|---|---|
| `tools.extra` | Entries separated by commas or spaces, each `<name>` or `<name>:<read\|write>`. Without a class, a tool is a write. Omitted: no extra tool |

The class decides which modes offer the tool: `read` in every mode, `write` in `default`, `acceptEdits` and
`bypassPermissions` only. Mark `read` only a tool that changes nothing and sends nothing off the machine. The
[permission gate](permissions.md#extra-tools) still decides each call. `/config set` refuses an entry that is not the
notation, that names a built-in tool, or that names a tool twice.

For instance, the speech server this repository ships ([below](#speech-to-text)) registers six tools, three of
which fit the list: `transcribe_audio`, `list_audio` and `whisper_info`. The other three, `record_and_transcribe`,
`speak` and `stop_speaking`, serve `/voice` and `/say` and stay out of it. Once the server is connected:

```text
/config set tools.extra transcribe_audio:read,list_audio:read,whisper_info:read
```

A name is matched against the names the host registers, case-insensitively as Orkeon matches them, and the turn
uses the registered spelling: an MCP server's `get-file-contents` is listed as `get-file-contents` (in any case), not
`get_file_contents`; `/debug-tool-call list` shows the registered names. `/permissions` shows the extra tools, the
ones the host does not register, and the entries it ignores; every turn warns about a listed tool the host does not
register, and leaves it out. In docker mode, a `Stdio` server's command
runs inside the container.

## Speech-to-text

`mcp/whisper/` holds an MCP server that transcribes audio and video files with
[faster-whisper](https://github.com/SYSTRAN/faster-whisper), on this machine by default. It needs
[uv](https://docs.astral.sh/uv/), nothing else: no `ffmpeg`, no Python package installed by hand. In tool and
source modes, one variable turns it on:

```bash
export ORKEON_CODE_AUDIO_DIR=~/audio      # the folder of audio and video files
./orkeon-code
```

The launcher then mounts that folder on `/audio` (read-only) and `<state>/transcripts` on `/transcripts`
(read-only, `.crew-output/transcripts` by default), and declares the server to the REPL through the environment
(`ORKEON_MCP__Servers__whisper__*`), so no settings file names this checkout. The banner shows an `audio` line.

`/transcribe` is the direct way: the call is the command's, so it needs no setting and the gate asks nothing.

| Command | What it does |
|---|---|
| `/transcribe --list` | The audio and video files under `/audio` |
| `/transcribe daily.m4a --lang fr` | Prints the transcription, or where it was written when it is long |
| `/transcribe daily.m4a --prompt "Orkeon, Jint, MCP"` | Spells these words right: module names, acronyms, people |
| `/transcribe daily.m4a --then "list the tasks I mention"` | Runs the instruction on the transcription, as `/assistant` would; a `plan:` prefix picks the mode |
| `/transcribe "team review.mp4"` | A name that holds a space, quoted |

`--then` comes last and takes the rest of the line as typed; `--lang` is also spelled `--language`. The
transcription runs in a crew, as long as it takes: one `/transcribe` at a time, and the REPL takes other commands
meanwhile. With `--then`, it is made at the start of the turn and counts within the turn's 30 minutes. The model can also call the tools itself, in a
request such as `transcribe /audio/daily.m4a and list the tasks I mention`, once offered:

| Step | Command |
|---|---|
| Check the connection, without a model | `/debug-tool-call whisper_info` |
| Offer the tools to the assistant | `/config set tools.extra transcribe_audio:read,list_audio:read,whisper_info:read` |

| Variable | Effect |
|---|---|
| `ORKEON_CODE_AUDIO_DIR` | Turns speech-to-text on: the folder mounted on `/audio` |
| `WHISPER_MODEL` | The model: `tiny`, `base`, `small` (default), `medium`, `large-v3`, `turbo` |
| `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE_TYPE=float16` | An NVIDIA GPU: the launcher adds the server's `cuda` extra, only the driver is needed ([GPU](../mcp/whisper/README.md#settings)) |
| `WHISPER_BACKEND`, `WHISPER_BASE_URL`, ... | Another backend: [mcp/whisper/README.md](../mcp/whisper/README.md#settings) |

`read` fits those three tools with the default local backend: they read `/audio` and write only under
`/transcripts`, outside the project. With `WHISPER_BACKEND=openai` the audio leaves the machine: mark
`transcribe_audio` `write`, or leave it out and use `/transcribe`. The server marks `transcribe_audio`, `list_audio`
and `whisper_info` read-only (`readOnlyHint`), which the permission gate reads once the server is declared trusted
(`TrustAnnotations: true`, exported by the launchers as `ORKEON_MCP__Servers__whisper__TrustAnnotations` and set in
the example settings; Orkeon #219, #223): they run without a question in every mode that offers them, `dontAsk`
included; `record_and_transcribe`, `speak` and `stop_speaking`
carry no annotation, so the gate asks about them in `default` and `acceptEdits` and refuses them in `plan` and
`dontAsk` ([Permissions](permissions.md#extra-tools)).

A short transcription comes back inline; a long one is written to `/transcripts/<name>.txt`, with its timestamps
in `<name>.segments.json` and, above 30,000 characters, in parts `<name>.part-NN.txt` that `file_read` reads one at
a time. The first transcription with a model downloads it (462 MB for `small`): `bash scripts/whisper-mcp-smoke.sh`
with `WHISPER_MODEL=small` does it beforehand. A 45-minute recording takes about 7 minutes with `small` on a CPU,
under 2 minutes on a laptop GPU, where `turbo` is the better model.

### Dictation

`/voice` dictates a request instead of typing it. The microphone and the speaker stay closed unless the launcher
runs with `ORKEON_CODE_VOICE=1` as well: the server then gets the `voice` extra (sounddevice, which needs PortAudio
on Linux: `libportaudio2`), and may record and play ([speech output](#speech-output)). Tool and source modes only.

```bash
export ORKEON_CODE_AUDIO_DIR=~/audio ORKEON_CODE_VOICE=1
./orkeon-code                                 # the banner's audio line says "microphone and speaker on"
```

| Command | What it does |
|---|---|
| `/voice` | Records until 2 s of silence (60 s at most), then shows the text; nothing is sent |
| `/voice send` | Sends the text shown to the assistant, as `/assistant` would: a leading `plan:`, in lower case as typed, picks the mode |
| `/voice --go` | Records and sends at once, for hands that are busy, under the session's mode (`/mode plan` first: no dictated prefix is read) |
| `/voice --lang fr --prompt "Orkeon, Jint"` | The language, and words to spell right, as for `/transcribe` |
| `/voice --max 30 --silence 1.5` | The longest recording (1 to 600 s), the silence that stops it (0.5 to 10 s) |

The recording stops after the silence once speech was heard, after 10 s without speech, or at the maximum. The
last recording is kept as `<state>/transcripts/dictation.wav`, its text as `dictation.txt` (what `/voice send`
sends); each recording empties them first, so one that fails leaves nothing to send, and stops a reading
aloud still playing, which the microphone would hear. `record_and_transcribe` is for `/voice`: never list it in
`tools.extra`, which would let the model open the microphone. A noisy room may need a higher `WHISPER_SILENCE_RMS` (default
`0.01`) for the silence to be heard.

### Speech output

`/say` reads aloud, through the same server: a text, or with nothing the assistant's last answer. The server reads
the words, not the Markdown: code blocks and tables are skipped, links keep their text, and a long answer is cut at
the last sentence ending in the second half of `TTS_MAX_CHARS` (1,200 characters), else at the limit itself; a text
with nothing else to read is not read. It synthesizes with
[Piper](https://github.com/OHF-Voice/piper1-gpl) on the CPU, where a sentence starts playing about 4 s after the
call, and plays in the background while the REPL takes the next command.

| Command | What it does |
|---|---|
| `/say Bonjour à tous` | Reads the text |
| `/say` | Reads the assistant's last answer |
| `/say --voice en_US-lessac-medium <text>` | Another [Piper voice](https://huggingface.co/rhasspy/piper-voices), fetched at first use |
| `/say --stop` | Cuts the reading |

`/config set voice.reply on` reads every answer aloud: `/assistant` and free text, `/summary`, `/transcribe --then`,
`/voice send` and `--go`. With `/voice --go`, that is a spoken conversation: the request is dictated, the answer read
back. The answer shows when its reading starts, once synthesized (a few seconds with Piper, under one with Kokoro);
`/say --stop` cuts it, `/config set voice.reply off` stops reading.
A turn whose reading fails keeps its answer, with a warning, and `voice.reply on` without the speech server warns at
each turn.

The voice is `fr_FR-siwis-medium` unless `TTS_VOICE` names another; the first reading downloads it (about 60 MB).
Two other backends speak the same: `TTS_BACKEND=openai` (OpenAI's speech API; the text leaves the machine) and
`TTS_BACKEND=http`, a compatible server such as [speaches](https://speaches.ai) running Kokoro on a GPU, a better voice
([mcp/whisper/README.md](../mcp/whisper/README.md#speech-output)).
Each reading is kept as `<state>/transcripts/speech.wav`, overwritten by the next. The launcher gives the server
Piper's `tts` extra whatever `ORKEON_CODE_VOICE` says: without it, the server writes that file and says it played
nothing. Piper is GPL-3.0: the server runs it as a separate process, from an optional extra, and never imports it.

- A settings file that declares a `whisper` server wins: the launcher leaves `ORKEON_CODE_AUDIO_DIR` aside, and
  `ORKEON_CODE_VOICE` with it, and says so. [config/appsettings.whisper.example.json](../config/appsettings.whisper.example.json)
  is that declaration, for a backend or folders of your own; it then carries everything: for `/say`, `--extra` and
  `tts` in its `Args`, for `/voice`, `--extra` and `voice` too, with `WHISPER_MICROPHONE` and `WHISPER_SPEAKER` at
  `1` in its `Env`. Without them, `/say` answers that Piper is not installed and `/voice` that the microphone is off.
  Its two folders must exist before the REPL starts: the launcher creates `<state>/transcripts` itself, a
  declaration by hand creates nothing.
  [config/appsettings.ollama-whisper.example.json](../config/appsettings.ollama-whisper.example.json) is the whole
  machine in one file: that declaration on an NVIDIA GPU with Piper, the microphone and the speaker, and the `Llm`
  section of the Ollama example.
- An environment that already declares one (`ORKEON_MCP__Servers__whisper__*`, docker mode's HTTP declaration
  for instance) wins the same way, with the same warning.
- Without uv on the `PATH`, the launcher warns and starts without the server.
- The REPL gives a server 30 s to start and answer, and the first `uv run` of `mcp/whisper` resolves its
  environment first: one to two minutes, 2.5 GB more with the `cuda` extra. Run `bash scripts/whisper-mcp-smoke.sh`
  once beforehand, with the `WHISPER_DEVICE` the REPL will use; otherwise the first REPL starts without the server
  (`MCP server 'whisper' could not be connected: no answer within 30 s`), and the next ones too until the
  environment is resolved.
- In docker mode, a `Stdio` server runs inside the container, which has neither uv nor the model: the variable is
  ignored there, with a warning. The server can run on the host over HTTP instead, for files transcribed within
  100 s ([mcp/whisper/README.md](../mcp/whisper/README.md#docker-mode-the-server-on-the-host)).

## Sessions

The REPL saves the conversation after each turn and when it ends (`Orkeon:Cli:Session:Persist`, `true` in the example
settings), and the launcher keeps it outside the project: in `~/.orkeon-code/projects/<project>/` once installed,
`.crew-output/projects/<project>/` in a clone, `<ORKEON_CODE_STATE>/projects/<project>/` when that variable is set.
`<project>` is the folder's name and a short hash of its path, so two projects of the same name never share it;
`project.json` there names the path. Nothing is written under the project's `.orkeon/sessions` any more (`/doctor`
warns when an older start left sessions there).

| Start | What it brings back |
|---|---|
| `orkeon-code` | A fresh session: the last one moves to the project's `history/` first |
| `orkeon-code --continue` (`-c`) | The session you quit |
| `orkeon-code --resume` | The saved sessions, newest first (date, title, messages, id), then asks which one |
| `orkeon-code --resume <number or id>` | That one, without asking (an id prefix that matches one session is enough) |

Without a terminal, `--resume` alone prints the list and exits with code 2. The newest 50 saved sessions are kept
(`ORKEON_CODE_SESSIONS_KEEP`, 1 to 9999); a session without a message is not kept. A second start while a session
is open on the same project warns, leaves the open one alone and keeps its own beside it, in the history from the
next start. Inside the REPL, `/resume` lists the saved sessions
(the launcher mounts `history/` read-only on `/session-history`); a REPL cannot swap its own conversation, so quit,
then start `orkeon-code --resume <id>`. The line editor's history (the up arrow) is not kept.

`--llm-log` among the REPL arguments writes the LLM log to `<project state>/llm-logs`, never into the project;
`--llm-log-path <folder>` is passed as given and wins over a bare `--llm-log`.

## Launcher environment

| Variable | Effect |
|---|---|
| `ORKEON_CODE_MODE` | `docker`, `tool` or `source` |
| `ORKEON_CODE_SETTINGS` | Settings file |
| `ORKEON_CODE_MODEL` | Model for this run |
| `ORKEON_CODE_AUDIO_DIR` | Folder of audio and video files: turns [speech-to-text](#speech-to-text) on (tool and source modes) |
| `ORKEON_CODE_VOICE` | `1`: opens the microphone to [`/voice`](#dictation) and the speaker to [`/say`](#speech-output) (with `ORKEON_CODE_AUDIO_DIR`) |
| `ORKEON_CODE_STATE` | Where `/output`, `/tmp`, `/user-config` and the transcripts live (default `.crew-output/` in a clone, `<home>/projects/<project>` in an install); the [sessions](#sessions) go under its `projects/<project>/` |
| `ORKEON_CODE_SESSIONS_KEEP` | How many saved [sessions](#sessions) a project keeps (default 50) |
| `ORKEON_CODE_HOME` | An install's own folder: its `appsettings.json`, its `trusted-folders.json`, its state and its demo repository (default `~/.orkeon-code`). A clone reads its `appsettings.json` and `trusted-folders.json` there too |
| `ORKEON_CODE_IMAGE` | Another runtime image (docker mode) |
| `ORKEON_REPL` | The command line that starts the REPL (tool mode) |
| `ORKEON_SOURCE` | Orkeon checkout (source mode) |
| `ORKEON_ESBUILD_PATH` | esbuild binary (tool and source modes) |
| `ORKEON_CODE_TRUST` | `1`: starts an untrusted folder without a terminal, only when `CI=true`, storing nothing ([Trusted folders](permissions.md#trusted-folders)) |

The launcher also exports `Orkeon__Security__PermissionGate__Enabled=true` and `Orkeon__Cli__Session__Persist=true` unless
they are set already (the settings file still wins over them), `ORKEON_Orkeon__Cli__Session__SessionsDirectory=/sessions`
(which wins over it), and, in tool and source modes, `ORKEON_ALLOW_EXTERNAL_MOUNTS=1`, so the REPL, started from
the project, accepts the `/output`, `/tmp`, `/user-config`, `/sessions` and `/session-history` mounts of the state directory. `/permissions` says whether the gate is on.
