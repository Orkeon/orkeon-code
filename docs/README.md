# Documentation

Orkeon Code's documentation, published as a browsable site at <https://orkeon.github.io/orkeon-code/>.
Start with [Getting started](getting-started.md); the [README](../README.md) gives the tour. The same pages exist
[in French](fr/README.md).

| | |
|---|---|
| [Getting started](getting-started.md) | Docker, tool and source modes, first session |
| [WSL tutorial](wsl-tutorial.md) | Speech and a local model on WSL2, on the GPU, step by step |
| [Configuration](configuration.md) | LLM providers, settings file, environment variables |
| [Permissions](permissions.md) | Modes, rules, what the agent can touch |
| [Slash commands](commands.md) | The full list (generated) |
| [Architecture](architecture.md) | Layers, ports, crews, the loop, prompt assembly, recipes |
| [Autonomous and embedded runs](headless.md) | Unattended turns, one-shot runs, schedulers and CI, your application |
| [Extending](extending.md) | Commands, crews, tools, prompts, modes, your own directories, the limits |
| [Development](development.md) | Tests, checks, typings, upgrading Orkeon, releasing |
| [Roadmap](roadmap.md) | What is missing and what comes next |

Decisions are recorded as ADRs: [0001 — ports, adapters and entry points](adr/0001-clean-architecture.md),
[0002 — Orkeon 1.0.0-rc.6 only](adr/0002-orkeon-rc6.md),
[0003 — prompts from a behaviour specification](adr/0003-prompts-from-a-behaviour-specification.md),
[0004 — Orkeon main after #180, on the rc.6 pin](adr/0004-orkeon-after-180.md).
