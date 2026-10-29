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
| [Hooks](hooks.md) | Your commands around the model's tool calls in the dev steps |
| [Shared memory](shared-memory.md) | Admitted decisions, structures, methods and mistakes the agents recall |
| [Slash commands](commands.md) | The full list (generated) |
| [Architecture](architecture.md) | Layers, ports, crews, the loop, prompt assembly, recipes |
| [Autonomous and embedded runs](headless.md) | Unattended turns, one-shot runs, schedulers and CI, your application |
| [Extending](extending.md) | Commands, crews, tools, prompts, modes, your own directories, the limits |
| [Development](development.md) | Tests, checks, typings, upgrading Orkeon, releasing |
| [Roadmap](roadmap.md) | What is missing and what comes next |

Decisions are recorded as ADRs: [0001 — ports, adapters and entry points](adr/0001-clean-architecture.md),
[0002 — Orkeon 1.0.0-rc.6 only](adr/0002-orkeon-rc6.md),
[0003 — prompts from a behaviour specification](adr/0003-prompts-from-a-behaviour-specification.md),
[0004 — Orkeon main after #180, on the rc.6 pin](adr/0004-orkeon-after-180.md),
[0005 — Orkeon main after #206, on the rc.6 pin](adr/0005-orkeon-after-206.md),
[0006 — Orkeon main after #213, on the rc.6 pin](adr/0006-orkeon-after-213.md),
[0007 — Orkeon main after #217, on the rc.6 pin](adr/0007-orkeon-after-217.md),
[0008 — Orkeon main after #223, on the rc.6 pin](adr/0008-orkeon-after-223.md),
[0009 — Orkeon main after #230, on the rc.6 pin](adr/0009-orkeon-after-230.md),
[0010 — Orkeon main after #234, on the rc.6 pin, now a release](adr/0010-orkeon-after-234.md),
[0011 — the gates of an unattended run, and five dev commands instead of eight](adr/0011-dev-gates-and-surface.md).
