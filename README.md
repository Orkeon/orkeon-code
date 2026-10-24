> 🇫🇷 [Version française](README.fr.md)

# Orkeon Code

[![CI](https://github.com/Orkeon/orkeon-code/actions/workflows/ci.yml/badge.svg)](https://github.com/Orkeon/orkeon-code/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Documentation](https://img.shields.io/badge/documentation-orkeon.github.io-blue.svg)](https://orkeon.github.io/orkeon-code/)

<p align="center">
  <img src="docs/assets/kama-surfer-docker.jpg" alt="Orkeon Code mascot — a chameleon surfing a wave" width="320">
</p>

**An agentic coding assistant in TypeScript on the [Orkeon](https://github.com/Orkeon/orkeon) runtime.** Pair with
it in the terminal under a permission mode you choose, let it run a task to the end on its own, or start its crews
from a script, a scheduler or your own application. It reads, searches, edits and runs code in your project through
tool calls, and everything it can touch is declared: one mounted project, an allow-listed shell, a tool catalogue
trimmed by the mode. Every command, crew and prompt is a source file: change it, or add yours.

> **Status: alpha.** The loop, the crews and the permission modes work end to end against real LLMs. Expect rough
> edges and breaking changes before 1.0.

## What it does

- **`/assistant`**: the interactive loop. The model explores the code with search and code-intelligence tools
  (hybrid code search, symbol source, call graphs, impact analysis), edits files and runs commands, turn after turn,
  under an execution budget. Free text typed without a leading `/` goes there.
- **Permission modes**: `plan` (read-only), `default` (asks you before an edit, a command or a network call),
  `acceptEdits` (edits without asking), `dontAsk`, `bypassPermissions`, chosen per request
  (`plan: explain the auth flow`) or for the session (`/mode`), plus allow/deny rules on a tool or on its arguments
  (`allow shell_command command=npm test*`). The Orkeon runtime enforces them and asks the questions.
- **Tools from MCP servers and plugins**: the tools Orkeon connects (`MCP:Servers`, `Plugins`) join the assistant's
  catalogue once `tools.extra` names them ([Configuration](docs/configuration.md#extra-tools-mcp-servers-and-plugins)).
- **Speech-to-text**: a Whisper MCP server ships in `mcp/whisper/`; `ORKEON_CODE_AUDIO_DIR` turns it on, and the
  assistant transcribes voice notes, meetings and screen recordings on your machine; `/voice` dictates a request
  and `/say` reads aloud ([Configuration](docs/configuration.md#speech-to-text)).
- **Crews for the recurring jobs**: `/init` (describe the project for the agent), `/commit` (a conventional commit
  from the diff), `/review`, `/security-review` (multi-lens code review), `/analyze` (deterministic
  codebase analysis), `/compact` and `/summary` (context management), `/init-verifiers`, `/advisor`.
- **Context management**: automatic compaction with a circuit breaker, snip-first `/compact`, file restore after
  compaction, context pressure tiers, typed durable memory (`/memory`).
- **53 slash commands** in all: [docs/commands.md](docs/commands.md).

## Quick start

You need the Orkeon runtime `1.0.0-rc.6` and an API key for an LLM provider Orkeon supports (any OpenAI-compatible
endpoint, Anthropic...). **Until Orkeon `1.0.0-rc.6` is tagged, only the launcher's source mode works**: set
`ORKEON_SOURCE` to an Orkeon checkout and add `--mode source` to the commands below; the docker and tool modes, and the
CI runtime smoke, wait for the tag. Once it is out, either of these runs Orkeon Code:

- **Docker**: the `orkeon-runners` image (amd64 and arm64), nothing else to install;
- **`orkeon-repl`** from the `orkeon` Debian/Ubuntu package (amd64 and arm64; `rc.6` is on the apt `rc` channel, the
  default `stable` channel carries finals only) or from the
  [Orkeon release archive](https://github.com/Orkeon/orkeon/releases) of your platform (Linux x64 and arm64, macOS x64
  and arm64, Windows x64 `.zip`), self-contained: no .NET to install.

**Windows**: `orkeon-code.ps1` has no source mode and no `--demo` (`-Mode` takes `docker` or `tool`), so until
`1.0.0-rc.6` is tagged nothing runs natively there. Use WSL with the bash launcher until then.

Details: [Getting started](docs/getting-started.md).

```bash
git clone https://github.com/Orkeon/orkeon-code.git ~/orkeon-code
cd ~/orkeon-code
cp config/appsettings.example.json config/appsettings.local.json   # pick the model and endpoint
export DEEPSEEK_API_KEY=...                                        # the variable named by Llm:ApiKeyEnvVar

./orkeon-code --demo              # try it on a throwaway sample repository
cd ~/src/my-project && ~/orkeon-code/orkeon-code                   # or on your project
```

Then, in the REPL (Read–Eval–Print Loop — the interactive console):

```text
/init                                    describe the project (writes AGENTS.md)
plan: how is the configuration loaded?   read-only question
acceptEdits: add input validation to parseArgs and a test for it
/diff
/commit
/review
```

## How it works

```text
 you ──▶ /command ──▶ *.cmd.ts (src/commands) ──script-host──▶ crew.ork.ts (src/crews)
                                                                   │  ctx.llm.act(): LLM ⇄ tools loop
                                                                   ▼
                                    Orkeon runtime (.NET): tools, permission gate, VFS, LLM providers
                                                                   │
                                                          /workspace = your project
```

Orkeon Code is the TypeScript layer: slash commands, crews and the shared domain logic they use. The
[Orkeon](https://github.com/Orkeon/orkeon) runtime executes them (Jint), provides the tools, enforces the permission
gate and confines every file access to the mounted project. The runtime version is pinned in
[`.orkeon-version`](.orkeon-version). Details: [Architecture](docs/architecture.md).

## Interactive, autonomous, embedded

The REPL is one way to run the crews, not the only one.

- **Interactive**: `./orkeon-code` on your project. `plan:` to ask, `acceptEdits:` to let it edit, `/mode` for the
  session; in `default` mode the runtime asks you before an edit, a command or a network call.
- **Autonomous**: in `bypassPermissions` the loop runs a task to the end without a question, under a budget (200 tool
  calls, 30 minutes, 400k tokens) and the host gate. `scripts/run-crew.sh` runs the same crew in one shot from a shell, a
  cron line or a CI job, and prints its result as JSON.
- **Embedded**: an application starts the `orkeon` tool (nuget.org) or the `orkeon-runners` image on a crew and reads
  the JSON; Orkeon's `orkeon-host` daemon can host the crews behind a chat channel or an A2A endpoint. In-process
  .NET embedding waits for the scripting layer to ship as a package.

Details and limits: [Autonomous and embedded runs](docs/headless.md).

## Make it yours

A command is a file in `src/commands`, a crew is a folder in `src/crews`, a tool is a `toolBuilder()` in a crew, a
prompt is a string with its test, and the permission modes are a table of tool names. There is no build step: the
runtime bundles the TypeScript and runs it at the next start. Your own crews and commands can live outside the
checkout (`--crews-dir`, `--commands-dir`), and the tools of MCP servers and plugins join the catalogue once
`tools.extra` names them, without a line of code. What moves with each change, and the limits:
[Extending Orkeon Code](docs/extending.md).

## Documentation

The pages below are published as a browsable site, with a search box:
<https://orkeon.github.io/orkeon-code/>. The same pages exist [in French](docs/fr/README.md); the decisions (ADR)
are written in English only.

| | |
|---|---|
| [Getting started](docs/getting-started.md) | Docker, tool and source modes, first session |
| [WSL tutorial](docs/wsl-tutorial.md) | Speech and a local model on WSL2, on the GPU, step by step |
| [Configuration](docs/configuration.md) | LLM providers, settings file, environment variables |
| [Permissions](docs/permissions.md) | Modes, rules, what the agent can touch |
| [Hooks](docs/hooks.md) | Your commands around the model's tool calls in the dev steps |
| [Slash commands](docs/commands.md) | The full list (generated) |
| [Architecture](docs/architecture.md) | Layers, ports, crews, the loop, prompt assembly, recipes |
| [Autonomous and embedded runs](docs/headless.md) | Unattended turns, one-shot runs, schedulers and CI, your application |
| [Extending](docs/extending.md) | Commands, crews, tools, prompts, modes, your own directories, the limits |
| [Development](docs/development.md) | Tests, checks, typings, upgrading Orkeon, releasing |
| [Roadmap](docs/roadmap.md) | What is missing and what comes next |

## Contributing

Issues and pull requests are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) first. A problem in the runtime itself
(tools, VFS, providers, the REPL host) belongs to [Orkeon/orkeon](https://github.com/Orkeon/orkeon/issues). Security
reports follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE.md) © 2026 Orkeon Contributors.
