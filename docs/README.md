# Documentation

Orkeon Code's documentation, published as a browsable site at <https://orkeon.github.io/orkeon-code/>.
Start with [Getting started](getting-started.md); the [README](../README.md) gives the tour. The same pages exist
[in French](fr/README.md).

## Use

| | |
|---|---|
| [Getting started](getting-started.md) | Docker, tool and source modes, first session |
| [WSL tutorial](wsl-tutorial.md) | Speech and a local model on WSL2, on the GPU, step by step |
| [Permissions](permissions.md) | Modes, rules, what the agent can touch |
| [Hooks](hooks.md) | Your commands around the model's tool calls in the dev steps |
| [Shared memory](shared-memory.md) | Admitted decisions, structures, methods and mistakes the agents recall |
| [Speech](speech.md) | Transcribing a file, dictating a request, reading an answer aloud |
| [Decision models](decision-models.md) | What Orkeon Code asks a decision model: pruning a long turn, routing a crew, suggesting skills, with what was measured |
| [Decision models locally](decision-models-local.md) | Kev on this machine and Liquid, step by step, with decision profiles to try |
| [Autonomous and embedded runs](headless.md) | Unattended turns, one-shot runs, schedulers and CI, your application |

## Reference

| | |
|---|---|
| [Configuration](configuration.md) | LLM providers, settings file, environment variables |
| [Slash commands](commands.md) | The full list (generated) |
| [Permissions reference](permissions-reference.md) | The order of the checks, what a rule reads, every rule of the dev steps' rule sets |

## Extend and contribute

| | |
|---|---|
| [Extending](extending.md) | Commands, crews, tools, prompts, modes, your own directories, the limits |
| [Architecture](architecture.md) | Layers, ports, entry points, the VFS, crews |
| [How a turn runs](turn.md) | The loop, prompt assembly, routing, skill suggestion, compaction |
| [Crew prompts](crew-prompts.md) | The behaviour each crew's prompt is written from |
| [Recipes](recipes.md) | Add a command, a crew, a tool, a mode, a prompt block, a config key, a port |
| [Development](development.md) | Tests, checks, typings, upgrading Orkeon, releasing |
| [Roadmap](roadmap.md) | What is missing and what comes next |

## Decisions

Decisions are recorded as ADRs, in English. The [index of the decisions](adr/README.md) lists them in two groups:
the design decisions, and the moves of the pin, each of which says what a newer Orkeon runtime changes for Orkeon
Code.
