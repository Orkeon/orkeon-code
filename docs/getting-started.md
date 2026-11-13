# Getting started

<p align="center">
  <img src="assets/kama-surfer-docker.jpg" alt="Orkeon Code mascot — a chameleon surfing a wave" width="200">
</p>

Orkeon Code is a set of TypeScript commands and crews; the [Orkeon](https://github.com/Orkeon/orkeon) REPL
(Read–Eval–Print Loop — the interactive console) runs them.
The `orkeon-code` launcher (and `orkeon-code.ps1` on Windows) finds a runtime, mounts your project and starts the
REPL. It needs three things: a runtime, a settings file and an API key.

## 1. Install

**From a release** (Linux, macOS, WSL): `install.sh`, published with each
[release](https://github.com/Orkeon/orkeon-code/releases), downloads that release's archive, checks it against its
`SHA256SUMS` and installs it into `~/.local/lib/orkeon-code/<version>`, with the `orkeon-code` command in
`~/.local/bin`; no `sudo`, no clone, no `npm ci`.

```bash
v=0.1.0                                                          # the release to install
curl -fLO "https://github.com/Orkeon/orkeon-code/releases/download/v$v/install.sh"
bash install.sh                                                  # or: bash install.sh --prefix /opt/tools
orkeon-code --version
```

`install.sh --archive orkeon-code-<version>.tar.gz` installs an archive already downloaded (checked against the
`SHA256SUMS` beside it, when there is one). Run again, it changes nothing; a new release goes into its own folder and becomes
`current`. `bash ~/.local/lib/orkeon-code/current/scripts/install.sh --uninstall` removes the program and the
command, never `~/.orkeon-code/`, where an install keeps what is yours: each project's state and sessions (`projects/`) and the demo repository
(`demo/`), `ORKEON_CODE_HOME` names another folder. On Windows, `install.ps1` does the same into
`%LOCALAPPDATA%\Programs\orkeon-code` and writes `bin\orkeon-code.cmd`, which `cmd.exe` and PowerShell both find.

**From npm** (Linux, macOS, Windows; Node 22 or later): the package carries the same files as the release archive,
and esbuild with them.

```bash
npm install -g orkeon-code@next                                  # a prerelease; orkeon-code once 1.0 is out
orkeon-code --version
```

`npm update -g orkeon-code` and `npm uninstall -g orkeon-code` leave `~/.orkeon-code/` alone too. In Docker mode on
macOS, the program must sit in a folder Docker Desktop shares with its containers (`/Users` by default): an npm prefix
under `/opt/homebrew` or `/usr/local` is not one, so add it under Settings > Resources > File sharing, or use
`install.sh`.

`orkeon-code --version` prints Orkeon Code's version, where it runs from (`install:` or `clone:`), the Orkeon commit
it expects (the pin) and the runtime it finds, without starting anything.

**From the sources**, to change Orkeon Code or follow `main`:

```bash
git clone https://github.com/Orkeon/orkeon-code.git ~/orkeon-code
```

Optionally put the launcher on your `PATH`: `ln -s ~/orkeon-code/orkeon-code ~/.local/bin/orkeon-code`. A clone keeps
its state in `.crew-output/` and its demo in `fixtures/`, and reads `config/appsettings.local.json` first.

## 2. Settings and key

```bash
cd ~/orkeon-code
cp config/appsettings.example.json config/appsettings.local.json
export DEEPSEEK_API_KEY=...
```

The example targets DeepSeek; any OpenAI-compatible endpoint, or another provider Orkeon supports (Anthropic
included), works by changing `Llm:BaseUrl`, `Llm:Model` and `Llm:ApiKeyEnvVar` ([Configuration](configuration.md)).
An install reads `~/.orkeon-code/appsettings.json`: `orkeon-code setup` writes it, or copy the example from
`~/.local/lib/orkeon-code/current/config/` there ([where the settings come from](configuration.md#where-the-settings-come-from)).
The launcher also takes `--settings FILE`. A model on this
machine instead, no key: `config/appsettings.ollama.example.json`, on Ollama ([Configuration](configuration.md#the-llm)).

## 3. Choose a runtime

**Windows**: `orkeon-code.ps1` has no source mode and no `--demo` (`-Mode` takes `docker` or `tool` only): the tool
mode on the release's `orkeon-<version>-win-x64.zip` is the one for Windows; the path this project exercises is WSL
with the bash launcher ([WSL tutorial](wsl-tutorial.md)). On both, a path spelled as the disk spells it
(`C:\proj\src\a.ts`, `/mnt/c/proj/src/a.ts`) is read as its `/workspace/…` path, in what you type, in the
model's calls and in what a command prints ([architecture](architecture.md#the-vfs-and-the-host-platform));
under WSL a Windows program is reachable without confinement only, and still receives `/mnt/c/…` paths.

- Orkeon Code is checked against Orkeon's sources at the commit in `.orkeon-version` (`cf56fae`, `main` after
  Orkeon/orkeon#356, 2026-11-13): the [source mode](#source-mode-an-orkeon-checkout) runs that commit, the reference
  runtime.
- The [tool mode](#tool-mode-orkeon-repl-installed) (the Debian package on the apt `stable` channel, the release
  archives) runs Orkeon's last release, `1.0.0` (`41f5079`), and the
  [docker mode](#docker-mode-nothing-to-install-but-docker) its image, `ghcr.io/orkeon/orkeon:latest`: both are
  behind the pin until Orkeon's next release, and `/status` says so ([ADR 0013](adr/0013-pin-on-orkeon-commit.md)).
  What they lack is listed in [ADR 0030](adr/0030-orkeon-after-356.md).
- The typings are those of the pin ([Development](development.md#typings)).

The launcher picks the first available mode, in this order, unless `--mode` says otherwise.

### Tool mode: `orkeon-repl` installed

The REPL is `orkeon-repl` (`Orkeon.ConsoleApp`) of the last release, `1.0.0`, which is the pin at this writing. The
Debian package and the
release archives carry it self-contained, with its own esbuild: no .NET to install.

**Debian and Ubuntu** (amd64, arm64): the `orkeon` package installs `/usr/bin/orkeon-repl`. Add Orkeon's apt source
once, as [Install with apt](https://github.com/Orkeon/orkeon/blob/main/docs/guides/install-with-apt.md) describes,
then `sudo apt install orkeon`. `1.0.0` is on the `stable` channel; a release candidate is published on the `rc`
channel (`Suites: raw/apt/rc/`).

**Other systems**: the **full archive** of the [Orkeon release](https://github.com/Orkeon/orkeon/releases) for your
platform: `orkeon-<version>-linux-x64.tar.gz`, `-linux-arm64`, `-osx-x64`, `-osx-arm64`, or, on Windows,
`orkeon-<version>-win-x64.zip` (the only Windows archive that carries `orkeon-repl`: the `.msi` is the `orkeon` CLI
and Orkeon Studio, with neither `orkeon-repl` nor `install.ps1`). Check it against the release's `SHA256SUMS`,
extract it and run `./install.sh`: it installs into `~/.local/lib/orkeon` and links `orkeon-repl` into
`~/.local/bin`, no `sudo`. On Windows, `install.ps1` installs into `%LOCALAPPDATA%\Programs\Orkeon` and adds its `bin`
folder to your user `PATH`.

```bash
v=1.0.0; rid=linux-x64       # the last release; or linux-arm64, osx-x64, osx-arm64
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

The launcher runs `ghcr.io/orkeon/orkeon:latest`, the image of the last release (`1.0.0` at this writing, which is
the pin; `ORKEON_CODE_IMAGE` names another image), which carries the
REPL and esbuild; the image is built for `linux/amd64` and `linux/arm64`, and Docker pulls the one of your machine. The project is mounted in the
container; on Linux the container runs with your uid, so the files the agent writes belong to you. The shell tool
runs inside the container.

The launcher checks that the engine answers before it starts the container: when Docker Desktop or the Docker service
is stopped, it says so and starts nothing.

### Source mode: an Orkeon checkout

`ORKEON_SOURCE=~/src/orkeon ./orkeon-code --mode source` builds `src/apps/Orkeon.ConsoleApp` in that checkout
(`dotnet build --no-restore`, under the checkout's own `global.json`), then runs the built
`bin/Debug/net10.0/Orkeon.ConsoleApp.dll` from your project with `dotnet <dll>`, which reads no `global.json`: a project
whose `global.json` pins another SDK still works. It needs the .NET 10 SDK, the Orkeon solution restored once
(`dotnet restore Orkeon.sln` in the checkout), and esbuild: `npm ci` once in this checkout, or `ORKEON_ESBUILD_PATH`.

The checkout should sit at the commit of `.orkeon-version`, the one the commands were checked against. The launcher
moves it there itself when nothing of yours is in the way: no tracked file changed, on `main` or detached, and behind
the pin (fetched from `origin main` when missing). It then says `orkeon-code: ORKEON_SOURCE moved from <sha7> to the pin
cf56fae.` and the build restores the solution. Otherwise (a branch of your own, uncommitted work, commits ahead of the
pin, or `ORKEON_SOURCE_FOLLOW_PIN=0`) it leaves the checkout alone, warns (`orkeon-code: warning: ORKEON_SOURCE is at
<sha7>, the pin of .orkeon-version is cf56fae: the commands were checked against the pin.`) and runs anyway.

### No runtime on the machine: the one Orkeon Code downloads

A package whose release published runtime archives names them in `.orkeon-runtime`: the seven characters of the pin
they were built from, their address and one SHA-256 per platform (`linux-x64`, `linux-arm64`, `osx-x64`,
`osx-arm64`). With neither `orkeon-repl`, Docker nor `ORKEON_SOURCE`, the bash launcher then offers to download that
runtime:

- It asks once, on the terminal, and downloads into `~/.orkeon-code/runtime/<id>/` (about 120 MB), nowhere else: no
  `sudo`, nothing added to your `PATH`.
- The archive is checked against the sum the package carries; a download that differs is deleted and nothing starts.
- Without a terminal nothing is downloaded and the launcher exits with 3. `ORKEON_CODE_RUNTIME_DOWNLOAD=1` agrees in
  advance, for a pipeline.
- `orkeon-code runtime install` downloads without starting a session, `orkeon-code runtime remove` deletes the
  folder.

Once downloaded, this runtime runs in tool mode and comes before Docker; an `orkeon-repl` on your `PATH` still comes
first. A newer package downloads its own runtime at its first start and removes the older one. In a checkout
`.orkeon-runtime` names nothing: use the source mode. `orkeon-code.ps1` does not download a runtime.

## 4. First session

```bash
orkeon-code --demo                   # a throwaway sample repository (fixtures/ in a clone, ~/.orkeon-code/demo once installed)
cd ~/src/my-project && orkeon-code   # the current directory is the project
orkeon-code --workspace ~/src/other  # or name it
```

The first start in a folder asks whether you trust it ([Trusted folders](permissions.md#trusted-folders)).
The banner prints the project, the settings and the mode. In the REPL:

| Try | What happens |
|---|---|
| `/doctor` | Shows the version, checks the LLM configuration, the tools, the mounts and what the project file set |
| `/init` | Analyses the project and writes `AGENTS.md`, the instructions the agent reads at every turn (an existing `CLAUDE.md` is merged into it, and still read when there is no `AGENTS.md`) |
| `plan: where are the HTTP routes defined?` | A read-only question |
| `rename parseArgs to parseCliArgs` | In `default` mode, the REPL asks before each edit: `[y] once / [s] session / [n] no` |
| `/mode acceptEdits` then `add a test for parseCliArgs` | Edits run without asking for the session; a command still asks |
| `/diff`, `/commit`, `/review` | Git workflows on the project |
| `/context`, `/compact`, `/usage` | The context window and the session |
| `/exit` | Leave |

Text typed without a leading `/` is sent to `/assistant`. The full list: [Slash commands](commands.md).

- On a terminal the REPL is a split-pane TUI: the transcript, the prompt, and below it the tasks list (`↓` or `F4`)
  that names the background commands (`/dev-batches`, `/analyze`).
- A prompt is the conversation: its text, tool calls, diffs and approvals land on the `main` screen, and the list
  stays empty until a command runs beside it.
- Each task has its own screen: selecting a task row displays that task's lines, selecting `main` the prompt's own,
  where the launched and finished lines of every task stay.
- The selected task is also the recipient of the next message.
- A task that ends leaves the list with its screen, unless you are reading that screen: it then stays, with `✔
  finished`, `✗ failed` or `⊘ cancelled` and its duration, until you leave it.
- `orkeon-code -- --ui plain` writes one stream instead, a task's lines prefixed by its ticket (`[t1] `).

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
models, backends and how the model calls the tools itself: [Configuration](speech.md#speech-to-text).

## What the agent writes in your project

- Besides the changes you ask for: `AGENTS.md` (`/init`), `.orkeon/config.json` (`/config`), `.orkeon/agents.json`
  (`/agents`) and `.git/ORKEON_COMMITMSG` (`/commit` writes the message there for `git commit -F`; git does not
  track it; in a linked worktree, whose `.git` is a file, the message goes to `.orkeon/ORKEON_COMMITMSG`, removed
  after the commit).
- The dev workflow adds `.orkeon/dev/` (each work's state files and logs), the work folder (`workbench/` by default,
  `dev.workDir`: specs, plans, batch sheets, verdicts), `.orkeon/worktrees/` (the worktrees of the batches),
  `.orkeon/dev-learn-state.json` (`/dev-learn`) and the [shared memory](shared-memory.md)'s folder
  (`.orkeon/memory/` unless `memory.dir` names another).
- The runtime records the embedding model the RAG's vectors came from, and refuses to start when it changes until
  the file is deleted. The launchers put that file beside the RAG's manifests, in `/output/rag/embedding-fingerprint.json`
  of the state directory, not in the project (`Orkeon:Embeddings:FingerprintPath` names another; a
  `.orkeon/embedding-fingerprint.json` left by an older launcher can be deleted). The runtime also writes `.orkeon/state` (the checkpoints and kept questions of a run, only with
  `Orkeon:Checkpointing:Enabled`, off in every example).
- The hook scripts you write (`.orkeon/hooks/` in the [examples](hooks.md)) are yours.
- Add `.orkeon/` and `workbench/` to the project's `.gitignore` if you do not want to share them: `/dev-status`
  warns while they are not ignored.
- A shared memory meant for the team goes in a tracked folder (`memory.dir`, `docs/memory` for instance).
- Transcriptions go to the state directory (`.crew-output/transcripts` in a clone,
  `~/.orkeon-code/projects/<project>/transcripts` once installed), never to the project.
- The conversation is saved there too after each turn and when the REPL ends ([Sessions](configuration.md#sessions):
  `--continue` brings it back).
- The session mode (`/mode`) and the permission rules are kept in memory and end with the REPL.

## Troubleshooting

- **Every answer is empty**: the settings file has no `Llm` section, or no key reaches the runtime. The launcher
  warns about both at start.
- **The turn waits on `approve <tool>? [y] once / [s] session / [n] no`**: the mode asks you about that call; answer
  on the next line. `acceptEdits:` or `/mode acceptEdits` stops the questions about edits, and an allow rule about the
  calls it matches ([Permissions](permissions.md)). A background command's question reads `approve <tool> for
  [t1]? …`, shows on the status line, on the task's row and, in the TUI, on the screen displayed whichever task
  asks, and is answered from the main prompt too.
- **Every shell command fails with a confinement error**: `Orkeon:Tools:Shell:Confinement:Mode` is `Auto` (the
  default when the settings leave the key out) or `Bubblewrap`, and the command cannot be confined (`bwrap` missing or
  unable to create its namespaces). Install bubblewrap, or set the mode to `None` as the examples do
  ([SECURITY.md](../SECURITY.md)).
- **No `audio` line in the banner, or `no registered tool 'transcribe_audio'`**: the launcher says why at start
  (uv missing, a `whisper` server in the settings file, docker mode). A server that cannot start costs one `fail:` line
  naming it; `bash scripts/whisper-mcp-smoke.sh` runs it alone ([mcp/whisper/README.md](../mcp/whisper/README.md#troubleshooting)).
  `MCP server 'whisper' could not be connected: no answer within 30 s` means the smoke script above was skipped:
  the first `uv run` resolves the server's environment in minutes, and the REPL waits 30 s.
- **A command is missing**: the loader keeps at most `Orkeon:Cli:ScriptCommands:MaxScripts` commands (200 by
  default). `bash scripts/smoke-runtime.sh` checks that every command loads.
- **The REPL refuses a mount and exits at start**: it refuses a mount on `/sandbox`, `/credentials`,
  `/cli-commands...` or `/crews...`, and a root mounted twice. The launcher mounts `/workspace`, `/output`, `/tmp`,
  `/user-config`, `/sessions`, `/session-history` and `/memory`, plus `/audio` and `/transcripts` when speech-to-text is on, and starts the REPL from the project with `ORKEON_ALLOW_EXTERNAL_MOUNTS=1`: check the `--mount` arguments
  passed after `--` and the `Orkeon:FileSystem:Mounts` of the settings file.
