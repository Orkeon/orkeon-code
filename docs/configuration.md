# Configuration

Orkeon Code has no configuration format of its own: the settings file is an Orkeon runtime settings file, read by
the REPL through `--settings`. Start from [`config/appsettings.example.json`](../config/appsettings.example.json).

## Where the settings come from

1. `--settings FILE` on the launcher;
2. `ORKEON_CODE_SETTINGS`;
3. `config/appsettings.local.json` in the checkout (ignored by git);
4. `~/.config/orkeon-code/appsettings.json` (`%APPDATA%\orkeon-code\appsettings.json` on Windows).

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
| `Llm:Thinking:Enabled` | Reasoning mode, for the providers that have one |

Orkeon recognises the native providers from the endpoint and the model (OpenAI, Anthropic, Gemini, Mistral, DeepSeek,
Z.AI, Moonshot, local servers...): the list and their options are in the
[Orkeon LLM providers documentation](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/llm-providers.md).
An option a provider cannot honour produces a warning, never a silent drop.

The agent calls tools through every provider: the runtime's tool loop (`ctx.llm.act`) reads the tool calls of the
Anthropic and OpenAI formats, runs every call of a model turn one after the other (not in parallel), each through the
permission gate, and sends the results back in the provider's tool protocol. A tool result reaches the model cut at
4000 characters, 32,000 for `file_read`.

## Settings Orkeon Code relies on

| Key | Why |
|---|---|
| `Orkeon:Security:PermissionGate:Enabled` = `true` | The host checks every tool call the model makes against the `/permissions` rules and the mode, and asks you when the mode says so ([what it does not see](permissions.md)). The launcher turns it on unless the settings file says otherwise; without it no call is checked and the modes only shape the catalogue |
| `Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout` | Wall-clock limit of each script engine of `orkeon-repl`: a command's, and a crew's, so an `/assistant` turn's. It stops while a tool call waits for your answer. 5 minutes by default; a turn that indexes a large repository needs more: the example sets 30 minutes |
| `Orkeon:Cli:ScriptCommands:Limits:MemoryLimitBytes` | Memory limit of those engines: 64 MB by default, the example sets 2 GiB |
| `Orkeon:Scripting:Limits:ExecutionTimeout`, `Orkeon:Scripting:Limits:MemoryLimitBytes` | The same limits for `orkeon run`, the tool `scripts/run-crew.sh` runs a crew with (30 seconds and 100 MB by default; the example sets 30 minutes and 2 GiB). `orkeon-repl` does not read them |
| `Orkeon:Tools:Shell:AllowInterpreters` | Lets `shell_command` run interpreters (`node`, `dotnet`, `npm`...), needed to build and test most projects |
| `Orkeon:Tools:Shell:ExtraAllowedCommands` | Commands added to the shell allow-list (`make`, `cargo`...) |
| `Orkeon:Tools:Shell:Confinement:Mode` | `None` (default) or `Bubblewrap`: runs each shell command under `bwrap` (Linux, tool and source modes), network off unless `Confinement:AllowNetwork`, programs outside the system directories listed in `Confinement:ReadOnlyPaths`. A command fails when `bwrap` cannot confine it. See [SECURITY.md](../SECURITY.md) |
| `Orkeon:Cli:ConsoleStreaming:Enabled` | Streams the answer as it is generated. The example enables it; the answer can be printed twice ([known issue](roadmap.md#known-issues)) |
| `Orkeon:Cli:ScriptCommands:MaxScripts` | Commands the loader keeps: 200 by default, above this project's command surface |
| `RateLimiting:*` | Request rate limits towards the provider |

**How long a turn may last.** Two limits bound an `/assistant` turn, and the first one reached ends it:

- the script engine's `ExecutionTimeout` above, which stops while a question waits for you;
- the main-loop crew's own budget, written in its code (`src/crews/main-loop/crew.ork.ts`): 200 tool calls, 400k
  tokens and 30 minutes of wall time. That clock is Orkeon's and does **not** stop while a question waits for you:
  a question left unanswered uses the turn's time, and the turn fails with `Wall time exceeded` at its next step.

`Orkeon:Cli:ScriptHost:RunCrewTimeout` (10 minutes by default) bounds only a crew a command waits for (`runCrew`);
Orkeon Code starts every crew with `runCrewAsync`, which it does not bound, so the example leaves it out.

## Session settings

Inside the REPL, `/config` lists, reads and writes the session keys (stored in the project's
`.orkeon/config.json`), for example `permissions.fallback` (the mode used when neither a prefix nor `/mode` chose
one), `tools.extra` (below), `voice.reply` ([speech output](#speech-output)), `answer.language` (the language the
assistant answers in, `/config set answer.language French`, unless a request is written in another one) or
`spinnerVerbs`. `/model`, `/effort`, `/passes`, `/fast`, `/proactive` and `/output-style` change how the next turns
run.

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
`transcribe_audio` `write`, or leave it out and use `/transcribe`. The permission gate still asks about each of the
model's calls in `default` and `acceptEdits`, since an MCP tool declares no access to Orkeon
([Permissions](permissions.md#extra-tools)).

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
- An environment that already declares one (`ORKEON_MCP__Servers__whisper__*`, docker mode's HTTP declaration
  for instance) wins the same way, with the same warning.
- Without uv on the `PATH`, the launcher warns and starts without the server.
- In docker mode, a `Stdio` server runs inside the container, which has neither uv nor the model: the variable is
  ignored there, with a warning. The server can run on the host over HTTP instead, for files transcribed within
  100 s ([mcp/whisper/README.md](../mcp/whisper/README.md#docker-mode-the-server-on-the-host)).

## Launcher environment

| Variable | Effect |
|---|---|
| `ORKEON_CODE_MODE` | `docker`, `tool` or `source` |
| `ORKEON_CODE_SETTINGS` | Settings file |
| `ORKEON_CODE_MODEL` | Model for this run |
| `ORKEON_CODE_AUDIO_DIR` | Folder of audio and video files: turns [speech-to-text](#speech-to-text) on (tool and source modes) |
| `ORKEON_CODE_VOICE` | `1`: opens the microphone to [`/voice`](#dictation) and the speaker to [`/say`](#speech-output) (with `ORKEON_CODE_AUDIO_DIR`) |
| `ORKEON_CODE_STATE` | Where `/output`, `/tmp` and the transcripts live (default `.crew-output/` in the checkout) |
| `ORKEON_CODE_IMAGE` | Another runtime image (docker mode) |
| `ORKEON_REPL` | The command line that starts the REPL (tool mode) |
| `ORKEON_SOURCE` | Orkeon checkout (source mode) |
| `ORKEON_ESBUILD_PATH` | esbuild binary (tool and source modes) |

The launcher also exports `Orkeon__Security__PermissionGate__Enabled=true` unless it is set already (the settings
file still wins over it), and, in tool and source modes, `ORKEON_ALLOW_EXTERNAL_MOUNTS=1`, so the REPL, started from
the project, accepts the `/output` and `/tmp` mounts of the state directory.
