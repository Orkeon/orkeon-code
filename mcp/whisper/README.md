# Whisper MCP server

Speech for Orkeon Code: a small MCP server over stdio (or HTTP, for docker mode), on
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) for speech-to-text and
[Piper](https://github.com/OHF-Voice/piper1-gpl) for speech output, that the REPL connects like any
server of `MCP:Servers`. Its tools:

| Tool | What it does |
|---|---|
| `transcribe_audio(path, language="", vocabulary="", vad_filter=true)` | Transcribes a file under the virtual folder `/audio`. The text comes back inline when it is short; otherwise it is written under `/transcripts` and the result says where. |
| `list_audio()` | The audio and video files under `/audio`, one virtual path per line, so the model never guesses a name. |
| `whisper_info()` | The transcription and speech backends, model and voice, whether they are already on disk, the folders in use, the microphone and the speaker. |
| `record_and_transcribe(max_seconds=60, silence_seconds=2, language="", vocabulary="")` | Records this machine's microphone until a silence and returns the text alone: Orkeon Code's `/voice`. Refused unless `WHISPER_MICROPHONE=1`. |
| `speak(text, voice="", wait=false)` | Reads a text aloud: the Markdown cleaned off (code blocks and tables are not read), synthesized, played on the speaker when `WHISPER_SPEAKER=1`, kept as `/transcripts/speech.wav`. Orkeon Code's `/say` and `voice.reply`. |
| `stop_speaking()` | Cuts the reading under way. |

It is the server of Orkeon's guide [Transcribe audio with Whisper through an MCP
server](https://github.com/Orkeon/orkeon/blob/main/docs/guides/whisper-mcp.md), hardened: the file
must stay under `/audio`, a container PyAV cannot read gives one line rather than a Python trace,
a long transcription is split into parts `file_read` can take one at a time, and two backends
besides the local model.

## Install

[uv](https://docs.astral.sh/uv/) resolves `pyproject.toml` (and its `uv.lock`) into
`mcp/whisper/.venv` the first time it runs the server; nothing else to install. Python 3.11 or
later, no `ffmpeg`: PyAV, which faster-whisper embeds, decodes audio and the audio track of a video.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh      # once
bash scripts/whisper-mcp-smoke.sh                     # resolves the environment, downloads the tiny model, transcribes a 5 s fixture
```

Run the smoke script before the first REPL, with the device the REPL will use (`WHISPER_DEVICE=cuda`
on a GPU) and `--tts` for speech output: Orkeon gives an MCP server 30 s to start and answer the handshake,
and the first `uv run` of this project resolves its environment first, one to two minutes, 2.5 GB more with
the `cuda` extra. Started by the REPL at that moment, the server misses the 30 s, the REPL goes on without
it (`MCP server 'whisper' could not be connected: no answer within 30 s`, then
`no registered tool 'whisper_info'`), and it misses them again at the next start. Once resolved, the
server starts in a few seconds.

The first transcription with a model downloads it (`small`: 462 MB, `medium`: 1.5 GB, from the
Hugging Face hub) and takes minutes; `whisper_info` says whether the model is on disk, and the smoke
script with `WHISPER_MODEL=small` pre-downloads it.

## Settings

In the settings file the launcher passes to the REPL (`config/appsettings.local.json`), two
sections. The two folders appear twice and must match: as the physical side of a mount, and in `Env`.
The agents know `/audio` and `/transcripts`; the server knows the folders. Both must exist before the REPL
starts (`mkdir -p ~/audio ~/transcripts`): the launcher creates `<state>/transcripts` itself when it declares
the server, a declaration by hand creates nothing.

```json
{
  "Orkeon": {
    "FileSystem": {
      "Mounts": [ "/home/me/audio:/audio:ro", "/home/me/transcripts:/transcripts:ro" ]
    }
  },
  "MCP": {
    "Servers": {
      "whisper": {
        "Transport": "Stdio",
        "Command": "/home/me/.local/bin/uv",
        "Args": [ "run", "--project", "/home/me/orkeon-code/mcp/whisper", "/home/me/orkeon-code/mcp/whisper/whisper_mcp.py" ],
        "Env": {
          "WHISPER_AUDIO_DIR": "/home/me/audio",
          "WHISPER_OUT_DIR": "/home/me/transcripts",
          "WHISPER_MODEL": "small"
        }
      }
    }
  }
}
```

`Command` is a program, not a shell line, found on the `PATH` of the REPL's process: a full path
is safer. The launcher writes this declaration itself when `ORKEON_CODE_AUDIO_DIR` is set
([configuration](../../docs/configuration.md#speech-to-text)). Then, in the REPL, `/transcribe <file>` calls the
server as the command; `/config set tools.extra transcribe_audio:read,list_audio:read,whisper_info:read` offers the
tools to the assistant; `/debug-tool-call whisper_info` checks the connection without a model.

| Variable | Meaning | Default |
|---|---|---|
| `WHISPER_AUDIO_DIR` | The folder mounted as `/audio` | required |
| `WHISPER_OUT_DIR` | The folder mounted as `/transcripts` | required |
| `WHISPER_BACKEND` | `local`, `openai` or `http` | `local` |
| `WHISPER_MODEL` | local: a faster-whisper model (`tiny`, `base`, `small`, `medium`, `large-v3`, `turbo`, …); openai: `whisper-1`; http: what the endpoint expects | `small` / `whisper-1` |
| `WHISPER_DEVICE` | local: `cpu` or `cuda` | `cpu` |
| `WHISPER_COMPUTE_TYPE` | local: `int8`, `float16` (GPU), `float32` | `int8` |
| `WHISPER_BASE_URL` | http: an OpenAI-compatible endpoint ([speaches](https://github.com/speaches-ai/speaches), whisper-server) | |
| `WHISPER_API_KEY_VAR` | The variable holding the key, exported in the shell that starts the REPL, never in a file; http: a key is sent only when this names its variable | openai: `OPENAI_API_KEY`; http: none |
| `WHISPER_MICROPHONE` | `1` lets `record_and_transcribe` open the microphone (the launcher sets it on `ORKEON_CODE_VOICE=1`) | off |
| `WHISPER_SILENCE_RMS` | The level under which a 0.1 s block counts as silence | `0.01` |
| `WHISPER_SPEAKER` | `1` lets `speak` play on the speaker (the launcher sets it on `ORKEON_CODE_VOICE=1`); off, `speak` only writes the file | off |
| `TTS_BACKEND` | `piper` (the `tts` extra), `openai` (OpenAI's speech API) or `http` (a compatible server, speaches): the last two need the `openai` extra | `piper` |
| `TTS_VOICE` | piper: a voice ([the list](https://huggingface.co/rhasspy/piper-voices)), downloaded at its first use (about 60 MB), or the path of a `.onnx` model; openai: `alloy`, `nova`...; http: what the server offers (Kokoro: `ff_siwis`) | `fr_FR-siwis-medium` / `alloy` / required |
| `TTS_MODEL` | openai: `gpt-4o-mini-tts`, `tts-1`; http: the server's model (`speaches-ai/Kokoro-82M-v1.0-ONNX`) | `gpt-4o-mini-tts` / required |
| `TTS_BASE_URL` | http: the server's endpoint (`http://<host>:8000/v1`) | required |
| `TTS_API_KEY_VAR` | As `WHISPER_API_KEY_VAR`, for speech output | openai: `OPENAI_API_KEY`; http: none |
| `TTS_VOICE_DIR` | Where the Piper voices are kept | `~/.cache/orkeon-code/piper` |
| `TTS_MAX_CHARS` | The longest text read aloud, cut at a sentence when one ends in its second half, else at the limit | `1200` |
| `WHISPER_TRANSPORT` | `stdio`, or `http` for [docker mode](#docker-mode-the-server-on-the-host) | `stdio` |
| `WHISPER_HTTP_HOST`, `WHISPER_HTTP_PORT` | http: where to listen; the endpoint is `/mcp` | `127.0.0.1`, `8765` |
| `WHISPER_HTTP_ALLOWED_HOSTS` | http: the `Host` headers accepted, comma-separated | `127.0.0.1:*,localhost:*,host.docker.internal:*` |

**Backends.** `local` runs on this machine and `openai` sends the audio to OpenAI's API, `http` to a compatible server
on another machine: both need the `openai` extra (`"Args": ["run", "--project", "…", "--extra", "openai",
"…/whisper_mcp.py"]`).

**GPU.** `WHISPER_DEVICE=cuda` with `WHISPER_COMPUTE_TYPE=float16` runs `local` on an NVIDIA GPU. The `cuda` extra
brings cuBLAS and cuDNN as wheels, which the server preloads before it builds the model, so neither the CUDA toolkit
nor `LD_LIBRARY_PATH` is needed, only the NVIDIA driver; the launchers add the extra themselves on
`WHISPER_DEVICE=cuda`. Measured on the 45-minute French recording of the validation:

| Model, device | 45 min of audio | Speed | Memory |
|---|---|---|---|
| `small`, 20-core CPU, int8 | 7 min 14 s | 6 × real time | |
| `small`, RTX 3070 Ti Laptop (8 GB, WSL2), float16 | 95 s | 28 × real time | 1.3 GB |
| `turbo` (large-v3-turbo), same GPU, float16 | 106 s | 25 × real time | |

`turbo` gets more names right without any vocabulary (Lilienthal, Ader, Wikipédia, where `small` wrote Lienthal,
Adair, bikipedia): on a GPU it is the better default, for a 1.6 GB download.

### Or the server in a container of its own

With an NVIDIA GPU that Docker can use (`docker run --gpus all ...` sees it), the server needs no Python on the host
either: a stock Python image runs it, uv resolving its environment outside the checkout (`UV_PROJECT_ENVIRONMENT`), the
model and uv caches in folders that outlive the container. The port is published on the host's loopback, which the
REPL's container reaches as `host.docker.internal` on Docker Desktop (on Linux, publish on the bridge address
instead, `-p 172.17.0.1:8765:8765`, accept it with `-e WHISPER_HTTP_ALLOWED_HOSTS=172.17.0.1:*`, and use it in
`Url`):

```bash
docker run -d --name whisper-mcp --gpus all -p 127.0.0.1:8765:8765 \
  -v "$PWD/mcp/whisper:/srv/whisper:ro" -v "$PWD/.crew-output:/data" \
  -v whisper-hf:/root/.cache/huggingface -v whisper-uv:/root/.cache/uv \
  -e UV_PROJECT_ENVIRONMENT=/opt/venv -e WHISPER_TRANSPORT=http -e WHISPER_HTTP_HOST=0.0.0.0 \
  -e WHISPER_AUDIO_DIR=/data/audio -e WHISPER_OUT_DIR=/data/transcripts \
  -e WHISPER_DEVICE=cuda -e WHISPER_COMPUTE_TYPE=float16 -e WHISPER_MODEL=small \
  python:3.11-slim-bookworm sh -c "pip install -q uv && uv run --frozen --project /srv/whisper --extra cuda /srv/whisper/whisper_mcp.py"
```

The first start downloads the CUDA libraries (about 2.5 GB) and the model into the two volumes; the next ones start
in seconds. `WHISPER_HTTP_HOST=0.0.0.0` listens on every interface of the container, which the `-p 127.0.0.1:...`
mapping keeps off the network.

## Dictation

`record_and_transcribe` reads the default input device through
[sounddevice](https://python-sounddevice.readthedocs.io/) (the `voice` extra: `uv run --project mcp/whisper --extra
voice ...`), at 16 kHz mono by blocks of 0.1 s. It stops after `silence_seconds` of quiet once speech was heard,
after 10 s without speech, or at `max_seconds`; nothing heard returns an empty text. The recording is kept as
`<WHISPER_OUT_DIR>/dictation.wav` and its text as `dictation.txt`, the text emptied and the audio removed when the
next recording starts (one that fails leaves no old text), then transcribed by the configured backend (with `openai`, the recording leaves the
machine). A reading of `speak` still playing is stopped first, so that the microphone does not record it. On Linux, sounddevice needs
the PortAudio library (`libportaudio2`); the macOS and Windows wheels carry it. No microphone in docker mode.

## Docker mode: the server on the host

In docker mode a `Stdio` server would run inside the container, which has neither uv nor the model. The server can
run on the host instead, over HTTP, and the REPL in the container reach it: `WHISPER_TRANSPORT=http` serves
Streamable HTTP on `/mcp`, one JSON answer per request and no session, which Orkeon's `Sse` transport reads. Files
go through the state directory, which the launcher already mounts in the container as `/work/state`:

```bash
mkdir -p .crew-output/audio .crew-output/transcripts          # drop the audio files in .crew-output/audio
WHISPER_TRANSPORT=http WHISPER_HTTP_HOST=<address> \
  WHISPER_AUDIO_DIR="$PWD/.crew-output/audio" WHISPER_OUT_DIR="$PWD/.crew-output/transcripts" \
  uv run --project mcp/whisper mcp/whisper/whisper_mcp.py &
./orkeon-code --mode docker -- --mount /work/state/audio:/audio:ro --mount /work/state/transcripts:/transcripts:ro
```

with, in the settings file, `"MCP": { "Servers": { "whisper": { "Transport": "Sse", "Url": "http://<host>:8765/mcp" } } }`.
On Docker Desktop (macOS, Windows), `<host>` is `host.docker.internal` and the server may listen on `127.0.0.1`. On
Linux, the container reaches the host on the bridge address (`172.17.0.1` by default): listen there
(`WHISPER_HTTP_HOST=172.17.0.1`), add it to `WHISPER_HTTP_ALLOWED_HOSTS` (`172.17.0.1:*`), and use it as `<host>`.
Never listen on `0.0.0.0`: Orkeon's HTTP transport sends no credentials, so the server has none to check, and every
machine of the network could list and transcribe the audio folder.

Two limits of Orkeon's HTTP transport: a call that lasts more than 100 s fails on the REPL's side (its HTTP client's
default timeout), although the server finishes and writes the transcript, so files whose transcription takes longer
are for the stdio modes: about 10 minutes of audio on a CPU with `small`, about 35 minutes on a laptop GPU (45 minutes
took 92 s with the server in one container, 117 s in another); and the transport sends no
`Accept` header and probes with a protocol version the SDK does not know, which the server smooths over
(`orkeon_http_compat`). The microphone stays on the host: `/voice` is for the stdio modes.

## Speech output

`speak` reads what is worth reading: code blocks, tables and rules are skipped, links keep their text and bare URLs
go, headings, bullets, bold and italics lose their marks, and a line without final punctuation gets a pause. A text
longer than `TTS_MAX_CHARS` is cut at a sentence when one ends in the second half of the limit, else at the limit
itself, and the result says which (`cut at a sentence`, `cut short`); a text with nothing to read (only code) gets a note, not an error,
and plays nothing. The audio is synthesized first (Piper on a CPU: about 4 s for a sentence of 100 characters, the
voice already downloaded; Kokoro through speaches on a GPU: 0.6 s), written to `<WHISPER_OUT_DIR>/speech.wav`, then
played in the background: `speak` returns as the reading starts, and a new `speak` cuts the one under way. With
`wait=true` it returns at the end of the reading, and the server answers no other call meanwhile, `stop_speaking`
included. A synthesis that fails leaves the last `speech.wav` as it was. Playback needs the `voice` extra
(sounddevice, PortAudio on Linux), Piper the `tts` extra:
`uv run --project mcp/whisper --extra voice --extra tts mcp/whisper/whisper_mcp.py`. The launchers add `tts`
whenever Piper is the backend, and `voice` on `ORKEON_CODE_VOICE=1`.

[Piper](https://github.com/OHF-Voice/piper1-gpl) (`piper-tts`) is GPL-3.0: the server runs it as a separate process
(`python -m piper`), never imports it, and it is an optional extra; the voices have licences of their own, listed with
each voice. In docker mode, the server on the host plays on the host's speaker.

**OpenAI's API, or Kokoro on a GPU through speaches.** `TTS_BACKEND=openai` sends the text to OpenAI (the key in
`OPENAI_API_KEY`, the text leaves the machine). `TTS_BACKEND=http` asks any server of the same API for a wav,
sending a key only when `TTS_API_KEY_VAR` names its variable;
[speaches](https://speaches.ai) serves [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), a better voice than Piper,
on an NVIDIA GPU, in a container:

```bash
docker run -d --name speaches --gpus all -p 127.0.0.1:8000:8000 -v speaches-hf:/home/ubuntu/.cache/huggingface \
  ghcr.io/speaches-ai/speaches:latest-cuda
curl -X POST http://localhost:8000/v1/models/speaches-ai/Kokoro-82M-v1.0-ONNX     # once: downloads the model
export TTS_BACKEND=http TTS_BASE_URL=http://localhost:8000/v1 \
  TTS_MODEL=speaches-ai/Kokoro-82M-v1.0-ONNX TTS_VOICE=ff_siwis                   # ff_siwis: Kokoro's French voice
```

The launchers add the `openai` extra themselves when `TTS_BACKEND` or `WHISPER_BACKEND` is `openai` or `http`.

## Results

A transcription under 3 500 characters (about 3 minutes of speech) comes back inline, followed by
the language detected, the duration, the word count and the files written. A longer one is written
only: `/transcripts/<name>.txt` (the audio's path under `/audio`, suffix changed), with
`<name>.segments.json` (timestamps) beside it and, above 30 000 characters, `<name>.part-NN.txt`
files of at most 30 000 characters cut between segments (or at a space, in a segment longer than
that), which the assistant reads one at a time
with `file_read`. The result names them and quotes the first 500 characters. These numbers follow
Orkeon's caps: 4 000 characters for a tool result, 32 000 for `file_read`.

`vocabulary` takes the words the speech is likely to contain (module names, acronyms, people), and Whisper spells
them right instead of guessing homophones. The local backend hands them to faster-whisper as `hotwords`, which
conditions every 30-second window; Whisper's `initial_prompt` conditions only the first, and changed none of the
names of a 16-minute French recording that `hotwords` all fixed. The `openai` and `http` backends send them as the
API's `prompt`. `language` empty lets the model detect it; naming it (`fr`, `en`) is faster and safer on short files.

## Why the server is written this way

| Orkeon's MCP client | Consequence here |
|---|---|
| The agents only know virtual paths; the client passes the arguments as they are | The server maps `/audio/x.m4a` to a file under `WHISPER_AUDIO_DIR`, and refuses anything that leaves it |
| A tool result is cut at 4 000 characters | Inline under 3 500; files above, in parts under `file_read`'s 32 000 |
| The handshake must answer within 30 s | The model is loaded at the first call, never at start |
| A command's awaited promise is bounded by Jint's 10 s `PromiseTimeout` | `/transcribe`, `/voice` and `/say` run the call in a crew (an async command), never in their handler |
| The `mcp` Python SDK 2.x renamed `FastMCP` and quits on stdin EOF before a running call answers | `mcp>=1.30,<2`, which speaks the protocol version Orkeon requires (2025-06-18) |
| In docker mode, a `Stdio` command runs inside the container | The server runs over stdio in `tool` and `source` modes, and on the host over HTTP for docker mode |
| Its HTTP transport sends no `Accept` header, probes with protocol `2026-07-28`, and gives up on an HTTP 400 | The http transport adds the header and drops a version the SDK does not know, so the probe falls back to the initialize handshake |

## Tests

```bash
uv run --project mcp/whisper pytest mcp/whisper   # unit tests, a fake model, no network
bash scripts/whisper-mcp-smoke.sh              # the real server over stdio, the tiny model, samples/fr-5s.wav
bash scripts/whisper-mcp-smoke.sh --tts        # and speak: Piper writes a sentence, Whisper hears it back
```

CI runs the unit tests with `mcp` and `pytest` only: `faster-whisper` is imported at the first
transcription (and by `whisper_info`, to name the model's repository), and the tests do without it. The fixture is CC0 ([samples/README.md](samples/README.md)).

## Troubleshooting

- `No module named 'mcp.server.fastmcp'`: the server runs on `mcp` 2.x. Run it with `--project
  mcp/whisper` (the lock pins 1.x), not with a bare `--with mcp`.
- `Failed to start MCP server process`: `Command` is not on the REPL's `PATH`: write the full path of
  `uv`.
- `MCP server 'whisper' could not be connected: no answer within 30 s` at the REPL's start, then
  `no registered tool 'whisper_info'`: the environment of `mcp/whisper` was not resolved yet, and its first
  `uv run` takes minutes where Orkeon gives a server 30 s. Resolve it once outside the REPL:
  `bash scripts/whisper-mcp-smoke.sh` with the same `WHISPER_DEVICE`, or the declared `Command` and `Args` run
  by hand with `< /dev/null` (the server quits when its input closes). Then start the REPL again.
- `Library libcublas.so.12 is not found`: `WHISPER_DEVICE=cuda` without the `cuda` extra. The launchers
  add it on `WHISPER_DEVICE=cuda`; a server declared by hand needs `--extra cuda` in its `Args`.
- `no microphone access (PortAudio library not found)`: the server runs without the `voice` extra, or Linux lacks
  `libportaudio2`. `the microphone is off`: the server runs without `WHISPER_MICROPHONE=1` (`ORKEON_CODE_VOICE=1`).
- `/voice` never stops before its maximum: the room is louder than `WHISPER_SILENCE_RMS`; raise it (0.02, 0.05).
- `the openai package is missing`: `TTS_BACKEND` or `WHISPER_BACKEND` is `openai` or `http` and the server runs
  without the `openai` extra (the launchers add it; a server declared by hand needs `--extra openai`).
- `cannot synthesize the text: ... model ... not found` with speaches: the model was not downloaded
  (`curl -X POST <server>/v1/models/<model>`).
- `Piper is not installed`: the server runs without the `tts` extra (by hand: `--extra tts` in its `Args`). `no speaker access`: without the `voice` extra,
  or Linux lacks `libportaudio2`. `not played: the speaker is off`: the server runs without `WHISPER_SPEAKER=1`.
- The first call is slow or seems stuck: the model is downloading. `whisper_info` reports
  `model_cached: False` until it is on disk.
- `Error: Timeout of 00:00:10 reached` from `/debug-tool-call transcribe_audio …`: Jint's limit on a
  synchronous command's promise, not the server's; the file is still written under `/transcripts`. Use
  `/transcribe`, which waits in a crew.
