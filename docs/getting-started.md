# Getting started

<p align="center">
  <img src="assets/kama-surfer-docker.jpg" alt="Orkeon Code mascot — a chameleon surfing a wave" width="200">
</p>

Orkeon Code is a set of TypeScript commands and crews; the [Orkeon](https://github.com/Orkeon/orkeon) REPL runs them.
The `orkeon-code` launcher (and `orkeon-code.ps1` on Windows) finds a runtime, mounts your project and starts the
REPL. It needs three things: a runtime, a settings file and an API key.

## 1. Get the sources

```bash
git clone https://github.com/Orkeon/orkeon-code.git ~/orkeon-code
```

Optionally put the launcher on your `PATH`: `ln -s ~/orkeon-code/orkeon-code ~/.local/bin/orkeon-code`.

## 2. Settings and key

```bash
cd ~/orkeon-code
cp config/appsettings.example.json config/appsettings.local.json
export DEEPSEEK_API_KEY=...
```

The example targets DeepSeek; any OpenAI-compatible endpoint, or another provider Orkeon supports (Anthropic
included), works by changing `Llm:BaseUrl`, `Llm:Model` and `Llm:ApiKeyEnvVar` ([Configuration](configuration.md)).
The launcher also looks for `~/.config/orkeon-code/appsettings.json`, or takes `--settings FILE`.

## 3. Choose a runtime

**Windows**: `orkeon-code.ps1` has no source mode and no `--demo` (`-Mode` takes `docker` or `tool` only), so until
`1.0.0-rc.6` is tagged nothing runs natively there. Use WSL with the bash launcher until then.

Orkeon Code requires Orkeon `1.0.0-rc.6`, the version in `.orkeon-version`. **Until that version is tagged and
published, only the [source mode](#source-mode-an-orkeon-checkout) works**: the tool mode needs its packages and the
docker mode its image, and the CI runtime smoke, which pulls that image, fails until then.

The launcher picks the first available mode, in this order, unless `--mode` says otherwise.

### Tool mode: `orkeon-repl` installed

The REPL is `orkeon-repl` (`Orkeon.ConsoleApp`), at the version in `.orkeon-version`. The Debian package and the
release archives carry it self-contained, with its own esbuild: no .NET to install.

**Debian and Ubuntu** (amd64, arm64): the `orkeon` package installs `/usr/bin/orkeon-repl`. Add Orkeon's apt source
once, as [Install with apt](https://github.com/Orkeon/orkeon/blob/main/docs/guides/install-with-apt.md) describes,
then `sudo apt install orkeon`. A release candidate such as `1.0.0-rc.6` is published on the `rc` channel
(`Suites: raw/apt/rc/`), not on `stable`.

**Other systems**: the **full archive** of the [Orkeon release](https://github.com/Orkeon/orkeon/releases) for your
platform: `orkeon-<version>-linux-x64.tar.gz`, `-linux-arm64`, `-osx-x64`, `-osx-arm64`, or, on Windows,
`orkeon-<version>-win-x64.zip` (the only Windows archive that carries `orkeon-repl`: the `.msi` is the `orkeon` CLI
and Orkeon Studio, with neither `orkeon-repl` nor `install.ps1`). Check it against the release's `SHA256SUMS`,
extract it and run `./install.sh` (`install.ps1` on Windows): it installs into `~/.local/lib/orkeon` and links `orkeon-repl` into
`~/.local/bin`, no `sudo`.

```bash
v=$(cat .orkeon-version); rid=linux-x64            # or linux-arm64, osx-x64, osx-arm64
curl -fLO "https://github.com/Orkeon/orkeon/releases/download/v$v/orkeon-$v-$rid.tar.gz"
curl -fLO "https://github.com/Orkeon/orkeon/releases/download/v$v/SHA256SUMS"
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf "orkeon-$v-$rid.tar.gz" && (cd "orkeon-$v-$rid" && ./install.sh)
```

The `orkeon-cli-*` archives and the `.msi` (checksum in `SHA256SUMS.msi`) carry the `orkeon` CLI only, not
`orkeon-repl`.

Alternatives: the .NET tool `Orkeon.ConsoleApp` from GitHub Packages (a GitHub token with `read:packages` is required
even though the package is public), or `ORKEON_REPL` set to any command line that starts the REPL. Neither ships
esbuild: run `npm ci` once in the checkout and the launcher uses the one npm installed (`ORKEON_ESBUILD_PATH`
overrides it).

### Docker mode: nothing to install but Docker

The launcher runs `ghcr.io/orkeon/orkeon-runners:<.orkeon-version>`, which carries the REPL and esbuild; the image
is built for `linux/amd64` and `linux/arm64`, and Docker pulls the one of your machine. The project is mounted in the
container; on Linux the container runs with your uid, so the files the agent writes belong to you. The shell tool
runs inside the container.

### Source mode: an Orkeon checkout

`ORKEON_SOURCE=~/src/orkeon ./orkeon-code --mode source` builds `src/apps/Orkeon.ConsoleApp` in that checkout
(`dotnet build --no-restore`, under the checkout's own `global.json`), then runs the built
`bin/Debug/net10.0/Orkeon.ConsoleApp.dll` from your project with `dotnet <dll>`, which reads no `global.json`: a project
whose `global.json` pins another SDK still works. It needs the .NET 10 SDK, the Orkeon solution restored once
(`dotnet restore Orkeon.sln` in the checkout), and esbuild: `npm ci` once in this checkout, or `ORKEON_ESBUILD_PATH`.

## 4. First session

```bash
./orkeon-code --demo                 # a throwaway sample repository (fixtures/, regenerated on demand)
cd ~/src/my-project && orkeon-code   # the current directory is the project
orkeon-code --workspace ~/src/other  # or name it
```

The banner prints the project, the settings and the mode. In the REPL:

| Try | What happens |
|---|---|
| `/doctor` | Checks the LLM configuration, the tools and the mounts |
| `/init` | Analyses the project and writes `AGENTS.md`, the instructions the agent reads at every turn (an existing `CLAUDE.md` is merged into it, and still read when there is no `AGENTS.md`) |
| `plan: where are the HTTP routes defined?` | A read-only question |
| `rename parseArgs to parseCliArgs` | In `default` mode, the REPL asks before each edit: `[y] once / [s] session / [n] no` |
| `/mode acceptEdits` then `add a test for parseCliArgs` | Edits run without asking for the session; a command still asks |
| `/diff`, `/commit`, `/review` | Git workflows on the project |
| `/context`, `/compact`, `/cost` | The context window and the session |
| `/exit` | Leave |

Text typed without a leading `/` is sent to `/assistant`. The full list: [Slash commands](commands.md).

## 5. Optional: speech-to-text

To hand the assistant a voice note, a recorded meeting or a screen recording with a spoken comment, in tool or
source mode:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh                # uv, once
mkdir -p ~/audio                                                # the folder of your audio and video files
WHISPER_MODEL=small bash scripts/whisper-mcp-smoke.sh --tts    # resolves the server's environment, Piper included, downloads the model, checks a 5 s sample
export ORKEON_CODE_AUDIO_DIR=~/audio
./orkeon-code --mode tool --workspace ~/src/my-project          # or --mode source; the banner shows an "audio" line
```

then, in the REPL: `/transcribe --list`, then `/transcribe daily.m4a --then "list the tasks I mention"`. With
`ORKEON_CODE_VOICE=1` exported too, `/voice` dictates a request and `/say` reads the last answer aloud. Details,
models, backends and how the model calls the tools itself: [Configuration](configuration.md#speech-to-text).

## What the agent writes in your project

Besides the changes you ask for: `AGENTS.md` (`/init`), `.orkeon/config.json` (`/config`), `.orkeon/agents.json`
(`/agents`) and `.git/ORKEON_COMMITMSG` (`/commit` writes the message there for `git commit -F`; git does not track
it). Add `.orkeon/` to the project's `.gitignore` if you do not want to share them. Transcriptions go to the state
directory (`.crew-output/transcripts` in this checkout), never to the project. The conversation, the
session mode (`/mode`) and the permission rules are kept in memory and end with the REPL.

## Troubleshooting

- **Every answer is empty**: the settings file has no `Llm` section, or no key reaches the runtime. The launcher
  warns about both at start.
- **The turn waits on `approve <tool>? [y] once / [s] session / [n] no`**: the mode asks you about that call; answer
  on the next line. `acceptEdits:` or `/mode acceptEdits` stops the questions about edits, and an allow rule about the
  calls it matches ([Permissions](permissions.md)).
- **Every shell command fails with a confinement error**: the settings set `Orkeon:Tools:Shell:Confinement:Mode` to
  `Bubblewrap`, and `bwrap` is missing or cannot create its namespaces (another OS, a container). Install bubblewrap,
  or set the mode back to `None` ([SECURITY.md](../SECURITY.md)).
- **No `audio` line in the banner, or `no registered tool 'transcribe_audio'`**: the launcher says why at start
  (uv missing, a `whisper` server in the settings file, docker mode). A server that cannot start costs one `fail:` line
  naming it; `bash scripts/whisper-mcp-smoke.sh` runs it alone ([mcp/whisper/README.md](../mcp/whisper/README.md#troubleshooting)).
- **A command is missing**: the loader keeps at most `Orkeon:Cli:ScriptCommands:MaxScripts` commands (200 by
  default). `bash scripts/smoke-runtime.sh` checks that every command loads.
- **The REPL refuses a mount and exits at start**: it refuses a mount on `/sandbox`, `/credentials`,
  `/cli-commands...` or `/crews...`, and a root mounted twice. The launcher mounts `/workspace`, `/output` and `/tmp`
  only, and starts the REPL from the project with `ORKEON_ALLOW_EXTERNAL_MOUNTS=1`: check the `--mount` arguments
  passed after `--` and the `Orkeon:FileSystem:Mounts` of the settings file.
