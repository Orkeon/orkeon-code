# Speech

Orkeon Code hears and speaks through the speech MCP server this repository ships: `/transcribe` turns an audio or
video file into text, `/voice` dictates a request, and `/say` reads an answer aloud. This page sets the three up and
lists their commands. The other settings are in [Configuration](configuration.md); a full setup on WSL2, on the GPU,
is in the [WSL tutorial](wsl-tutorial.md).

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
(`ORKEON_MCP__Servers__whisper__*`), so no settings file names this checkout. The banner shows an `audio` line. The
folder holds real files: a link in it that points outside it is refused by the file tools.

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
the example settings): they run without a question in every mode that offers them, `dontAsk`
included; `record_and_transcribe`, `speak` and `stop_speaking`
carry no annotation, so the gate asks about them in `default` and `acceptEdits` and refuses them in `plan` and
`dontAsk` ([Permissions](permissions.md#extra-tools)).

- A short transcription comes back inline.
- A long one is written to `/transcripts/<name>.txt`, with its timestamps in `<name>.segments.json` and, above
  30,000 characters, in parts `<name>.part-NN.txt` that `file_read` reads one at a time.
- The first transcription with a model downloads it (462 MB for `small`): `bash scripts/whisper-mcp-smoke.sh` with
  `WHISPER_MODEL=small` does it beforehand.
- A 45-minute recording takes about 7 minutes with `small` on a CPU, under 2 minutes on a laptop GPU, where `turbo`
  is the better model.
- The runtime ends a server call that outlasts `MCP:Servers:whisper:CallTimeout` (60 s by default) with
  a tool error, although the server finishes and writes the transcript: the launchers export
  `ORKEON_MCP__Servers__whisper__CallTimeout=00:15:00` and the example settings set the same 15 minutes, which cover
  a dictation at its longest (`/voice --max 600`) and a long file on a CPU.
- A settings file of your own that declares the server needs the key too, or a dictation past 60 s fails.

## Dictation

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

## Speech output

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
  `ORKEON_CODE_VOICE` with it, and says so.
  [config/appsettings.whisper.example.json](../config/appsettings.whisper.example.json) is that declaration, for a
  backend or folders of your own.
  - It then carries everything: for `/say`, `--extra` and `tts` in its `Args`, for `/voice`, `--extra` and `voice`
    too, with `WHISPER_MICROPHONE` and `WHISPER_SPEAKER` at `1` in its `Env`.
  - Without them, `/say` answers that Piper is not installed and `/voice` that the microphone is off.
  - Its two folders must exist before the REPL starts: the launcher creates `<state>/transcripts` itself, a
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
