# Tutorial: speech and a local model on WSL2, on the GPU

This tutorial installs Orkeon Code on WSL2 (Windows 11) and plugs into it, on the machine's graphics card,
speech-to-text (Whisper), speech output (Piper, then Kokoro as an option) and a local language model (Qwen through
Ollama): nothing leaves the machine. It was run in October 2026 on a Windows 11 laptop with an NVIDIA GeForce RTX
3070 Ti Laptop (8 GB of video memory); the durations and sizes quoted come from there.

**Everything is typed in a WSL terminal** (Ubuntu or Debian), never in PowerShell, except the lines marked
*PowerShell*. The blocks are copied as they are, one per step, and each step says what you must see.

## 0. The route

| Step | What | Checked by |
|---|---|---|
| 1 | Start clean: remove an earlier try | nothing answers any more |
| 2 | WSL's audio (WSLg): Windows' speakers and microphone seen from Linux | you hear yourself |
| 3 | Orkeon from its apt package | `orkeon --version` |
| 4 | Orkeon Code in the WSL home, its settings, `uv` | `/doctor` in the REPL |
| 5 | The speech server alone: Whisper on the CPU then on the GPU, Piper | the smoke script |
| 6 | In the REPL: `/transcribe`, `/say`, `/voice`, the spoken conversation | you hear the answer |
| 7 | Option: the Kokoro voice on the GPU (speaches, Docker) | `/say` with a better voice |
| 8 | Option: the language model on this machine, `qwen3.5:2b` through Ollama on the same GPU | `/doctor`, `ollama ps` |

The bricks: **Whisper** (OpenAI's speech recognition model, open weights), which Orkeon Code's `mcp/whisper` server
runs through `faster-whisper`; **Piper**, a light speech synthesis engine, on the CPU; the whole exposed to the REPL
as an MCP server the `orkeon-code` launcher declares itself; **Ollama**, which serves a language model on the GPU,
which Orkeon recognises by its port.

## 1. Start clean

If the distribution has already seen a try of Orkeon or of speech, remove what would get in the way: the `orkeon`
apt package and its source, an install from a release archive (`~/.local/lib/orkeon`, `~/.local/bin/orkeon-repl`),
the speech server's environment of an earlier clone, a `speaches` container. Each line does nothing when there is
nothing to remove. Python packages installed by hand with pip (`faster-whisper`, `piper-tts`, `sounddevice`) go
with `pip uninstall`; the downloaded models, the Docker images and `~/.config/Orkeon` stay: section 10 takes care of
them.

```bash
sudo rm -f /etc/apt/sources.list.d/orkeon.sources /etc/apt/sources.list.d/orkeon.list && (dpkg -s orkeon >/dev/null 2>&1 && sudo apt-get purge -y orkeon orkeon-archive-keyring || true) && sudo rm -f /usr/share/keyrings/orkeon-archive-keyring.gpg && sudo apt-get update -qq
```

```bash
rm -rf ~/.local/lib/orkeon ~/.local/bin/orkeon-repl ~/.local/bin/orkeon ~/orkeon-code/mcp/whisper/.venv; docker rm -f speaches 2>/dev/null; command -v orkeon orkeon-repl || echo clean
```

Expected: `clean`.

## 2. WSL's audio

On Windows 11, WSLg gives every distribution a PulseAudio server wired to Windows' sound card
(`/mnt/wslg/PulseServer`, the `PULSE_SERVER` variable already set). The speech server records and plays through
PortAudio, which speaks ALSA on Linux: ALSA must be routed to PulseAudio (`~/.asoundrc` and the `libasound2-plugins`
plugin).

If WSL has not been updated for a long time (*PowerShell*, once):

```powershell
wsl --update
```

```powershell
wsl --shutdown
```

Then, in WSL (`curl` and `git` too, which a bare image lacks):

```bash
sudo apt-get update && sudo apt-get install -y curl ca-certificates git pulseaudio-utils libportaudio2 libasound2-plugins
```

```bash
printf 'pcm.!default { type pulse }\nctl.!default { type pulse }\n' > ~/.asoundrc
```

```bash
pactl info | grep -E "Server String|Default Sink|Default Source"
```

Expected: `Server String: unix:/mnt/wslg/PulseServer`, `Default Sink: RDPSink`, `Default Source: RDPSource`.

**The speakers**: the 5-second French sentence shipped with the server (it speaks of "dérive"), taken from GitHub
since the repository is not cloned yet:

```bash
curl -fsSL -o /tmp/fr-5s.wav https://raw.githubusercontent.com/Orkeon/orkeon-code/main/mcp/whisper/samples/fr-5s.wav && paplay /tmp/fr-5s.wav
```

**The microphone**: 20 seconds of dictation (read a paragraph aloud; `Ctrl+C` stops earlier), played back at once.
This file serves in step 6:

```bash
mkdir -p ~/audio && timeout 20 parecord --channels=1 --rate=16000 --file-format=wav ~/audio/note.wav ; paplay ~/audio/note.wav
```

> **The microphone records silence only**: Windows → Settings → Privacy & security → Microphone → "Let desktop
> apps access your microphone" (WSLg goes through the Remote Desktop client, `msrdc.exe`). Then `wsl --shutdown`
> (*PowerShell*) and reopen the WSL terminal. Check the default microphone in Windows' sound settings too.

## 3. Orkeon from its apt package

Orkeon Code asks for Orkeon `1.0.0-rc.6` (`.orkeon-version`). Until that version is tagged and published on the
`rc` channel ([Getting started](getting-started.md)), Orkeon's `main` is what it needs: the `dev` channel publishes
one package per commit the CI validated, versioned `1.0.0~rc.5.dev.<n>` (above rc.5, below rc.6; `n` is the number
of the CI run), the last three builds only. The package installs `/usr/bin/orkeon-repl` (the REPL, with its
`esbuild`: no .NET and no npm to install) and `orkeon` (the CLI). Supported systems: Debian 12 and 13, Ubuntu 22.04,
24.04 and 26.04 (`cat /etc/os-release` says which you have).

The block is the one of Orkeon's guide
([Install with apt](https://github.com/Orkeon/orkeon/blob/main/docs/guides/install-with-apt.md)), with the one
difference the guide prescribes for a build of `main`: `Suites: raw/apt/dev/` instead of `stable`. The key is
checked by its SHA-256 before apt is trusted with it, for this source only (`Signed-By`).

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
```

```bash
curl -fsSL -o /tmp/orkeon-archive-keyring.gpg https://github.com/Orkeon/orkeon/raw/apt/orkeon-archive-keyring.gpg
```

```bash
echo "0cc5e804e1ee49c50ec5b23145ee7ee65d4834a08b8dc38914674249dfcc6a21  /tmp/orkeon-archive-keyring.gpg" | sha256sum --check
```

Expected: `/tmp/orkeon-archive-keyring.gpg: OK`. Otherwise, do not go on.

```bash
sudo install -m 0644 /tmp/orkeon-archive-keyring.gpg /usr/share/keyrings/orkeon-archive-keyring.gpg
```

```bash
sudo tee /etc/apt/sources.list.d/orkeon.sources > /dev/null <<'EOF'
Types: deb
URIs: https://github.com/Orkeon/orkeon/
Suites: raw/apt/dev/
Include: orkeon orkeon-archive-keyring
Signed-By: /usr/share/keyrings/orkeon-archive-keyring.gpg
EOF
```

```bash
sudo apt-get update && sudo apt-get install -y orkeon orkeon-archive-keyring
```

```bash
orkeon --version && command -v orkeon-repl
```

Expected: `1.0.0-rc.5.dev.<n>` (or the form `orkeon` prints for `1.0.0~rc.5.dev.<n>`) and `/usr/bin/orkeon-repl`.
Later, the latest build of `main` comes with `sudo apt update && sudo apt upgrade`; `apt list -a orkeon` lists the
channel's.

## 4. Orkeon Code in the WSL home

A checkout on the Windows drive (`/mnt/c/...`) is readable from WSL, but running the REPL there and creating the
speech server's `.venv` there would be slow (the 9p file system) and fragile (permissions, symbolic links). The
repository is cloned from GitHub into the WSL home, on ext4 (a clone already there is brought up to date instead):

```bash
if [ -d ~/orkeon-code/.git ]; then git -C ~/orkeon-code pull --ff-only; else git clone https://github.com/Orkeon/orkeon-code ~/orkeon-code; fi && cd ~/orkeon-code && git log --oneline -1
```

Expected: the last commit of `main`.

The settings and the language model's key (the example targets DeepSeek; any OpenAI-compatible endpoint, or another
provider Orkeon knows, is set in the `Llm` section: [Configuration](configuration.md)). The key stays in an
environment variable, never in a file:

```bash
cp config/appsettings.example.json config/appsettings.local.json
```

```bash
export DEEPSEEK_API_KEY=...
```

`uv`, which resolves and starts the speech server (Python 3.11 or later; `uv` downloads one when the distribution
has none):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.local/bin/env && uv --version
```

A first REPL, without speech, on the throwaway sample repository (`--demo`), in `tool` mode (the package's
`orkeon-repl`):

```bash
./orkeon-code --mode tool --demo
```

The banner shows `orkeon-code <version> on Orkeon 1.0.0-rc.6 (tool)` (Orkeon's version is the one of
`.orkeon-version`, not the package's), the project and the settings file. In the REPL:

| Command | Expected |
|---|---|
| `/doctor` | The LLM configuration, the tools and the mounts green; `toolchain: node` and `toolchain: dotnet` may stay red (section 9), without effect in `tool` mode |
| `/permissions` | The gate's state: `on` (a recent `main` of Orkeon; `unknown` would mean a build too old) |
| `plan: what does this project do?` | An answer from the model (otherwise: the key does not arrive, the launcher said so at start) |
| `/exit` | Exit |

## 5. The speech server alone

Two prerequisites of section 4, which the script does not check itself:

- **From `~/orkeon-code`, not from a checkout on `/mnt/c/...`.** The script moves into the checkout it lives in:
  started from the Windows drive, it creates `mcp/whisper/.venv` and its CUDA wheels (2.5 GB) through the 9p file
  system: slow, and fragile. The ext4 clone in the WSL home is there for that.
- **`uv` on the `PATH`.** Without it the script stops on `whisper-mcp-smoke: uv not found. Install it: curl …`. The
  installer of section 4 puts `uv` in `~/.local/bin` and adds that folder to the `PATH` of *new* terminals; a
  terminal opened before wants `source ~/.local/bin/env`. And section 10 removes `uv`: after a full clean-up,
  section 4 is to be done again.

The smoke script starts the server as Orkeon does, over stdio, lists its six tools, transcribes `fr-5s.wav` and,
with `--tts`, has Piper write a sentence (speaker off) that the same server transcribes back. The first run
resolves the Python environment into `mcp/whisper/.venv` (one to two minutes), downloads the model (`small`:
462 MB) and Piper's French voice (`fr_FR-siwis-medium`, 63 MB, under `~/.cache/orkeon-code/piper`). That is why the
smoke comes before the first REPL: Orkeon gives an MCP server 30 s to answer, and a first `uv run` started by the
REPL exceeds them (section 9).

**On the CPU**:

```bash
WHISPER_MODEL=small bash scripts/whisper-mcp-smoke.sh --tts
```

Expected: `handshake + list_tools: … s, tools: list_audio, record_and_transcribe, speak, stop_speaking,
transcribe_audio, whisper_info`, the report of `whisper_info`, the transcription containing "dérive", then Piper's
sentence transcribed back ("synthèse vocale" with `small`). Order of magnitude of `small` on a CPU: 6 × real time.

**On the GPU.** Under WSL no NVIDIA driver is installed in Linux: Windows' is enough, and the server's `cuda` extra
brings cuBLAS and cuDNN as Python wheels (about 2.5 GB at the first call), which the server preloads itself: no CUDA
Toolkit, no `LD_LIBRARY_PATH`. `turbo` (`large-v3-turbo`, 1.6 GB to download) is the better model on an 8 GB GPU: it
writes right the proper nouns `small` distorts (`small` fits in 1.3 GB of video memory).

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
```

Expected: the card's name and memory, for instance `NVIDIA GeForce RTX 3070 Ti Laptop GPU, 8192 MiB`.

```bash
WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 WHISPER_MODEL=turbo bash scripts/whisper-mcp-smoke.sh --tts
```

Expected: the same output as on the CPU, `whisper_info` saying `cuda` and `float16`, and a first run that downloads
several GB (CUDA wheels, `turbo`, the Piper voice): a few minutes. Measured on this GPU, for a 45-minute recording:
`small` in 95 s (28 × real time), `turbo` in 106 s, against 7 min 14 s for `small` on a 20-core CPU.

## 6. In the REPL: transcribe, read aloud, dictate

Five variables are enough for the launcher: it mounts `~/audio` on `/audio`, writes the transcripts under
`.crew-output/transcripts` (seen as `/transcripts`), declares the server to the REPL with the `tts`, `voice` and
`cuda` extras, and opens the microphone and the speaker (`ORKEON_CODE_VOICE=1`).

```bash
export ORKEON_CODE_AUDIO_DIR=~/audio ORKEON_CODE_VOICE=1 WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 WHISPER_MODEL=turbo
```

```bash
./orkeon-code --mode tool --demo
```

The banner gains a line: `audio    : /home/<you>/audio -> /audio (transcripts: …/.crew-output/transcripts, model
turbo on the GPU, microphone and speaker on)`. If it is missing, the launcher said why just before (`uv` missing
from the `PATH`, for instance: `source ~/.local/bin/env`).

**Transcription** (the note of step 2):

| Command | Expected |
|---|---|
| `/debug-tool-call whisper_info` | The `local` backend, `turbo` on `cuda`, `model_cached: True`, microphone and speaker `on` |
| `/transcribe --list` | `/audio/note.wav` |
| `/transcribe note.wav --lang fr` | The text of your note; `--prompt "Orkeon, MCP, WSL"` spells right the names you quote |
| `/transcribe note.wav --then "summarize this note in one sentence"` | The model answers on the transcription (a key is needed) |

A short transcription comes back inline; a long one is written under `/transcripts/<name>.txt` (and in parts
`.part-NN.txt` above 30,000 characters) that the assistant reads with `file_read`. One transcription at a time; the
REPL stays available while it runs.

**Speech output** (Piper, on the CPU: a sentence starts about 4 s after the command, the REPL hands back at once):

| Command | Expected |
|---|---|
| `/say Hello, speech output works.` | The sentence in the speakers; a line `reading aloud: N characters, X s` |
| `/say` | The assistant's last answer, read: the Markdown cleaned (code blocks and tables skipped) |
| `/say --stop` | Cuts the reading |
| `/say --voice en_US-lessac-medium Hello there` | Another Piper voice, downloaded at its first use |

**Dictation** (the server records until 2 s of silence, 60 s at most; nothing is sent without an order):

| Command | Expected |
|---|---|
| `/voice --lang fr` | Speak; at the stop, `🎙 <your sentence>` then `send it: /voice send · …` |
| `/voice send` | The sentence goes to the assistant as a typed request |
| `/config set voice.reply on` | Every answer is now read aloud |
| `/voice --go` | Records and sends in one go: the full spoken conversation, dictated request, read answer |
| `/config set voice.reply off` then `/exit` | Back to silence, exit |

Measured on this machine: a 236-character answer read in 14 s; `/voice` cuts a reading under way before opening the
microphone, so as not to record it. In a noisy room, `/voice` does not stop by itself: export
`WHISPER_SILENCE_RMS=0.02` (or `0.05`) before starting again.

## 7. Option: the Kokoro voice on the GPU (speaches)

Piper is enough, but [speaches](https://github.com/speaches-ai/speaches) serves the Kokoro voice, more natural,
through the same API as OpenAI's, on the GPU: synthesizing a sentence takes 0.6 s instead of 4.5. It needs Docker in
WSL with the GPU: Docker Desktop (WSL integration enabled for your distribution) provides it with nothing else. No
key goes to this server (the speech server sends one only when `TTS_API_KEY_VAR` names one).

```bash
docker run -d --name speaches --gpus all -p 127.0.0.1:8000:8000 -v speaches-hf:/home/ubuntu/.cache/huggingface ghcr.io/speaches-ai/speaches:latest-cuda
```

```bash
curl -X POST http://localhost:8000/v1/models/speaches-ai/Kokoro-82M-v1.0-ONNX
```

Expected: the model's download (26 s measured), once.

```bash
export TTS_BACKEND=http TTS_BASE_URL=http://localhost:8000/v1 TTS_MODEL=speaches-ai/Kokoro-82M-v1.0-ONNX TTS_VOICE=ff_siwis
```

```bash
./orkeon-code --mode tool --demo
```

Then `/say Hello, this is Kokoro on the graphics card.`: the `ff_siwis` voice (Kokoro's French) almost without
delay. The launcher added the `openai` extra to the server by itself. Back to Piper: `unset TTS_BACKEND
TTS_BASE_URL TTS_MODEL TTS_VOICE`. Stop the server: `docker stop speaches`.

## 8. Option: Qwen on this machine with Ollama

The language model of sections 4 to 6 is remote (DeepSeek, a key). [Ollama](https://ollama.com) runs one on the
GPU, with no key and nothing leaving the machine; Orkeon recognises it by its port (`11434`) and speaks to it
natively (`/api/chat`, tool calls included). This tutorial takes **`qwen3.5:2b`**: 2.7 GB, a 256K window, tools,
reasoning and vision, which fits beside Whisper `turbo` in the card's 8 GB (about 3 GB loaded). The smallest Qwen of
the library, `qwen2.5:0.5b` (398 MB), checks the plumbing (Orkeon ↔ Ollama, native tool calls, the shared GPU) but
little else; `qwen3:8b` (5.2 GB), with which Orkeon Code was validated, no longer fits beside `turbo` (section 9).
Another Qwen is the same commands with its name: the table says which ones fit. The Qwen of the Ollama library in
October 2026 (size of the default tag, announced window; all call tools, `qwen3` and later reason, `qwen3.5` and
later see images):

| Model | MB | Window | Beside `turbo` (8 GB) |
|---|---|---|---|
| `qwen2.5:0.5b` | 398 | 32K | yes, the smallest |
| `qwen3:0.6b` | 523 | 40K | yes |
| `qwen2.5:1.5b` | 986 | 32K | yes |
| `qwen3.5:0.8b` | 1,200 | 256K | yes |
| `qwen3:1.7b` | 1,400 | 40K | yes |
| `qwen2.5:3b` | 1,900 | 32K | yes |
| `qwen3:4b` | 2,500 | 256K | yes |
| `qwen3.5:2b` | 2,700 | 256K | yes, this tutorial's choice |
| `qwen3.5:4b` | 3,300 | 256K | yes |
| `qwen2.5:7b` | 4,700 | 32K | barely |
| `qwen3:8b` | 5,200 | 40K | spills over to the CPU |
| `qwen3.5:9b` | 6,600 | 256K | no |
| `qwen2.5:14b`, `qwen3:14b` | 9,000, 9,300 | 32K, 40K | no |
| `qwen3.8:27b`, `qwen3.6:27b`, `qwen3.5:27b` | 18,000, 18,000, 17,000 | 256K | no |
| `qwen3:30b`, `qwen3-coder:30b` | 19,000 | 256K | no |
| `qwen2.5:32b`, `qwen3:32b` | 20,000 | 32K, 40K | no |
| `qwen3.5:35b`, `qwen3.6:35b` | 22,000, 23,000 | 256K | no |
| `qwen2.5:72b`, `qwen3.5:122b`, `qwen3:235b`, `qwen3-coder:480b` | 47,000, 81,000, 142,000, 290,000 | 32K or 256K | no |

`qwen2.5-coder` exists in the same sizes as `qwen2.5` (0.5b to 32b, 32K), trained for code.

**Ollama in the distribution.** No driver other than Windows': the installer recognises WSL2 and skips the NVIDIA
driver install. Ollama already installed (`ollama --version` answers): the installer updates it, nothing else.

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Expected: `>>> Installing ollama to /usr/local`, the creation of the user and the service
(`>>> Enabling and starting ollama service...`), `>>> Nvidia GPU detected.`, then
`>>> The Ollama API is now available at 127.0.0.1:11434.` and `>>> Install complete.`. A
`WARNING: systemd is not running` means a distribution without systemd: enable it (`[boot]` `systemd=true` in
`/etc/wsl.conf`, then `wsl --shutdown` on the Windows side), or run `ollama serve &` in this terminal at every
session.

**The context window.** Ollama serves every model with 4,096 tokens by default, and Orkeon does not widen it per
request (it sends no `num_ctx`). Orkeon Code's system prompt is already about 2,250 of them, before the tool
schemas and the conversation: beyond the window, Ollama truncates the start of the prompt without an error, and the
model loses its instructions and its tools. The service therefore gets 16,384 tokens, through a systemd drop-in:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d && printf '[Service]\nEnvironment="OLLAMA_CONTEXT_LENGTH=16384"\n' | sudo tee /etc/systemd/system/ollama.service.d/context.conf >/dev/null && sudo systemctl daemon-reload && sudo systemctl restart ollama && systemctl show ollama -p Environment
```

Expected: an `Environment=…` line that contains `OLLAMA_CONTEXT_LENGTH=16384` (without systemd:
`OLLAMA_CONTEXT_LENGTH=16384 ollama serve &` instead).

**The model**:

```bash
ollama pull qwen3.5:2b && ollama run qwen3.5:2b "Answer in one word: what is the capital of France?" && ollama ps
```

Expected: the download (2.7 GB, once), `Paris` after a few lines of reasoning (`qwen3.5` reasons before it
answers), then a line `qwen3.5:2b … 100% GPU` (the model stays loaded 5 minutes after the last call). `100% CPU`,
or a split `xx%/yy% CPU/GPU`, would mean the driver is not seen (section 9).

**Orkeon Code's settings.** Two ready examples in the repository, for a second file beside the one of section 4 (a
`.local.json` stays out of git):

- [config/appsettings.ollama-whisper.example.json](../config/appsettings.ollama-whisper.example.json), **the
  validated way**: `appsettings.example.json` whose `Llm` section targets Ollama (`qwen3.5:2b` on
  `http://localhost:11434`, no key since Orkeon asks Ollama for none, temperature 0.6, Qwen's recommendation for its
  reasoning mode, `qwen3.5:4b` and `qwen3.5:0.8b` in `AvailableModels`), plus the speech server declared in the
  file: `turbo` on `cuda`, Piper, microphone and speaker. Four `/home/me/...` paths to replace with yours; the
  checkout is `~/orkeon-code`. The server's two folders must exist: nothing creates them for you.
- [config/appsettings.ollama.example.json](../config/appsettings.ollama.example.json), the same `Llm` section
  alone: the speech server then stays declared by the launcher from the variables of section 6.

With the first one, one line copies, replaces the paths, creates the folders and checks:

```bash
cd ~/orkeon-code && cp config/appsettings.ollama-whisper.example.json config/appsettings.ollama.local.json && sed -i "s#/home/me#$HOME#g" config/appsettings.ollama.local.json && mkdir -p ~/audio ~/transcripts && grep -o "$HOME/orkeon-code/mcp/whisper" config/appsettings.ollama.local.json | wc -l
```

Expected: `2` (the server's two paths, `--project` and the script, point at your clone).

Then the server's environment, resolved once outside the REPL: exactly the command the file declares, its input
closed so that the server stops by itself once started. Orkeon gives an MCP server 30 s to answer; this first
`uv run` downloads the CUDA wheels (cuBLAS 554 MB, cuDNN 731 MB) and exceeds them by far: started by the REPL, the
server would be missed at every start (`no registered tool 'whisper_info'`).

```bash
cd ~/orkeon-code && time (WHISPER_AUDIO_DIR=$HOME/audio WHISPER_OUT_DIR=$HOME/transcripts WHISPER_MODEL=turbo WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 WHISPER_MICROPHONE=1 WHISPER_SPEAKER=1 ~/.local/bin/uv run --project ~/orkeon-code/mcp/whisper --extra voice --extra tts --extra cuda ~/orkeon-code/mcp/whisper/whisper_mcp.py < /dev/null)
```

Expected the first time: `Preparing packages`, the two NVIDIA wheels downloading, then the silent stop and a `real`
of several minutes; run again, it comes back in a few seconds without printing anything. The smoke of section 5,
run in this clone, prepares the same environment and downloads `turbo` too.

**In the REPL.** The variables of section 6 are no longer needed, the file carries everything; still exported, the
launcher says `declares a "whisper" MCP server: ORKEON_CODE_AUDIO_DIR is ignored, the settings file wins`, without
consequence.

```bash
./orkeon-code --mode tool --demo --settings config/appsettings.ollama.local.json
```

The launcher asks for no key (the `Llm` section names no `ApiKeyEnvVar`).

| Command | Expected |
|---|---|
| `/doctor` | `llm: model configured ✅ qwen3.5:2b`, the catalogue of the three Qwen, `/audio(ro)` and `/transcripts(ro)` among the mounts; `toolchain: node` or `dotnet` red (section 9), without effect here |
| `/debug-tool-call whisper_info` | `audio: /audio -> /home/<you>/audio`, `microphone: on (WHISPER_MICROPHONE=1)`, `speaker: on (WHISPER_SPEAKER=1)`, `backend: local`, `model: turbo`, `device: cuda`, `compute_type: float16`, `model_cached: True` once the GPU smoke of section 5 has run, `False` otherwise, `tts_backend: piper`, `tts_voice: fr_FR-siwis-medium` |
| `plan: what does this project do?` | An answer from the local model, short; in another terminal, `ollama ps` shows the model loaded and `nvidia-smi` Ollama and the speech server side by side (`turbo`: about 2 GB, Qwen: about 3 GB) |
| `/transcribe note.wav --then "summarize this note in one sentence"` | The first call downloads `turbo` (1.6 GB) if section 5 did not; then the transcription by Whisper, the summary by Qwen, on the same GPU: nothing left the machine |
| `/model` | `qwen3.5:4b` and `qwen3.5:0.8b` too; an `ollama pull <name>` before switching to another |
| `/exit` | Exit |

An answer that keeps you waiting is `qwen3.5`'s reasoning: `"Thinking": {"Enabled": false}` in the `Llm` section
cuts it, at the price of less sure tool calls. Back to DeepSeek: start again without `--settings`. Stop Ollama:
`sudo systemctl stop ollama` (it restarts with the distribution; `sudo systemctl disable ollama` prevents it).

## 9. Troubleshooting

| Symptom | Lead |
|---|---|
| `pactl: Connection failure` or a `Server String` that is not `/mnt/wslg/PulseServer` | `echo $PULSE_SERVER` empty: `export PULSE_SERVER=unix:/mnt/wslg/PulseServer`; a `pulseaudio` daemon installed in the distribution by an earlier try takes the place of WSLg's: `sudo apt-get purge pulseaudio`; otherwise `wsl --update` then `wsl --shutdown` |
| `paplay` gives nothing, without an error | Windows' default output; `pactl list short sinks` must show `RDPSink` |
| The microphone records silence | Windows' privacy (step 2); `pactl list short sources` must show `RDPSource` |
| `apt-get update`: `NO_PUBKEY` | The key is missing or not in the right format: redo the three lines of the key (step 3) |
| `apt-get update`: `Conflicting distribution` | The `Suites:` line was changed beyond the channel's name |
| `apt-get install orkeon`: `Unable to locate package orkeon` | The source is not on `raw/apt/dev/` (`stable` is empty) |
| `/doctor`: `toolchain: node ❌`, or `toolchain: dotnet ❌ 10.0.2xx [/usr/share/dotnet/sdk]` | `tool` mode needs neither: the package ships its own esbuild, and nothing calls `dotnet`. To turn them green all the same: node at the version of `.nvmrc` (nodesource or nvm); for dotnet, the repository's `global.json` asks for the SDK `10.0.300` or a later feature band (`latestFeature`) and the distribution has an older band: `sudo apt-get install --only-upgrade dotnet-sdk-10.0` (Microsoft's apt feed, `/usr/share/dotnet`) |
| No `audio` line in the banner | The launcher said why: `uv` missing from the `PATH`, a `whisper` server already declared in the settings or the environment, docker mode |
| `whisper-mcp-smoke: uv not found. Install it: …` | Step 4 was not done, or section 10 went through, or the terminal predates the install: `source ~/.local/bin/env`; otherwise `curl -LsSf https://astral.sh/uv/install.sh \| sh && source ~/.local/bin/env` |
| `MCP server 'whisper' could not be connected: no answer within 30 s` at start, then `no registered tool 'whisper_info'` | Orkeon gives the server 30 s to answer; the clone's first `uv run` resolves the environment (CUDA wheels, minutes). Prepare the environment outside the REPL: the smoke (section 5), or the declared command run once by hand with `< /dev/null` (section 8); then start again |
| `MCP server 'whisper' could not be connected: …` with a path | A path of the settings file is wrong: `Command` (`~/.local/bin/uv`), `--project` and the script (`~/orkeon-code/mcp/whisper`), the two folders written twice in `Mounts` and `Env` |
| `fail: … Failed to start MCP server process` | `uv` is not on the REPL's `PATH`: `source ~/.local/bin/env` then start again |
| `Library libcublas.so.12 is not found` | `WHISPER_DEVICE=cuda` without the `cuda` extra: the launcher and the smoke add it by themselves on `WHISPER_DEVICE=cuda`; a server declared by hand wants `--extra cuda` |
| `CUDA driver version is insufficient`, or `nvidia-smi` missing in WSL | Update the NVIDIA driver on the **Windows** side; `wsl --update` |
| `no microphone access (PortAudio library not found)` | `libportaudio2` is missing, or the server runs without the `voice` extra (`ORKEON_CODE_VOICE=1`) |
| `the microphone is off` / `not played: the speaker is off` | `ORKEON_CODE_VOICE=1` was not exported at start |
| `/voice` only stops at its maximum | The room is louder than `WHISPER_SILENCE_RMS`: `0.02`, `0.05` |
| `Piper is not installed` | The server runs without the `tts` extra (the launcher adds it as soon as Piper is the engine) |
| The first call seems stuck | The model is downloading; `whisper_info` says `model_cached: False` until it is on disk |
| `Error: Timeout of 00:00:10 reached` on `/debug-tool-call transcribe_audio` | Jint's limit on a synchronous command, not the server's: use `/transcribe`, which waits in a crew |
| Whisper invents text on silence | A known hallucination; the `vad_filter` is on by default; name the language (`--lang fr`) |
| `connection refused` on `localhost:11434`, or `/doctor` cannot reach the model | The Ollama service is not running: `sudo systemctl start ollama` (`systemctl status ollama`); without systemd, `ollama serve &` |
| The local model ignores its instructions or its tools; `journalctl -u ollama \| grep truncat` shows `truncating input prompt` | The default window of 4,096 tokens: `systemctl show ollama -p Environment` must contain `OLLAMA_CONTEXT_LENGTH=16384` (section 8) |
| `ollama ps`: `100% CPU` | The Windows driver is not seen by Ollama: `nvidia-smi` in WSL, `journalctl -u ollama \| grep -i cuda`; update the driver on the Windows side, `wsl --shutdown` |
| An 8-billion Qwen (`qwen3:8b`, 5.2 GB) on top of `turbo` on the GPU | Together they approach the 8 GB: the language model spills over to the CPU (`ollama ps`: `xx%/yy% CPU/GPU`); take `small` for Whisper, or a smaller Qwen (section 8) |

## 10. Remove everything

In order: the two blocks of step 1 (the package and its source, the local install, the `.venv`, the container),
then what they keep.

```bash
rm -rf ~/orkeon-code ~/audio ~/transcripts ~/.asoundrc ~/.config/Orkeon ~/.cache/orkeon-code ~/.cache/huggingface/hub/models--Systran--faster-whisper-* ~/.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo
```

```bash
rm -rf ~/.cache/uv ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/env
```

```bash
sudo apt-get purge -y pulseaudio-utils libportaudio2 libasound2-plugins
```

```bash
docker rmi ghcr.io/speaches-ai/speaches:latest-cuda ; docker volume rm speaches-hf
```

Expected, after the last two: `Removing …` for the three packages, then `Untagged: …` and `speaches-hf` (or
`No such image` / `No such volume` if step 7 was not done).

Ollama (step 8), with its models (`/usr/share/ollama`); the settings file went with `~/orkeon-code`:

```bash
sudo systemctl stop ollama ; sudo systemctl disable ollama ; sudo rm -rf /etc/systemd/system/ollama.service /etc/systemd/system/ollama.service.d /usr/local/lib/ollama /usr/local/bin/ollama /usr/share/ollama ~/.ollama ; sudo userdel ollama ; sudo groupdel ollama ; sudo systemctl daemon-reload
```

Expected: `Removed … ollama.service` at the `disable`, then nothing; `ollama --version` now answers
`command not found`.

## 11. What this tutorial does not check

- OpenAI's API (`WHISPER_BACKEND=openai`, `TTS_BACKEND=openai`): the audio or the text leave the machine, and an
  `OPENAI_API_KEY` is needed; nothing here needs one.
- The launcher's docker mode: the speech server then runs on the host, over HTTP, without a microphone
  ([mcp/whisper/README.md](../mcp/whisper/README.md#docker-mode-the-server-on-the-host)). This tutorial's `tool` mode
  is the simplest and the only one where `/voice` and `/say` have the microphone and the speaker.
- Ollama installed on the Windows side rather than in the distribution: from WSL, `localhost:11434` reaches it only
  with mirrored networking (`networkingMode=mirrored` in `.wslconfig`) or an `OLLAMA_HOST=0.0.0.0` on the Windows
  side and the host's address in `BaseUrl`; step 8 installs Ollama in the distribution, where it sees the GPU through
  the same driver.
- The PowerShell launcher (`orkeon-code.ps1`), native Windows: it has no source mode, and WSL with the bash launcher,
  as here, is the documented way.
