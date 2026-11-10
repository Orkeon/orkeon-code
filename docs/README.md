# Documentation

Orkeon Code's documentation, published as a browsable site at <https://orkeon.github.io/orkeon-code/>.
Start with [Getting started](getting-started.md); the [README](../README.md) gives the tour. The same pages exist
[in French](fr/README.md).

| | |
|---|---|
| [Getting started](getting-started.md) | Docker, tool and source modes, first session |
| [WSL tutorial](wsl-tutorial.md) | Speech and a local model on WSL2, on the GPU, step by step |
| [Configuration](configuration.md) | LLM providers, settings file, environment variables |
| [Decision models locally](decision-models-local.md) | Kev on this machine and Liquid, step by step, with decision profiles to try |
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
[0011 — the gates of an unattended run, and five dev commands instead of eight](adr/0011-dev-gates-and-surface.md),
[0012 — Orkeon main after #239, the exclusive crew launch](adr/0012-orkeon-after-239.md),
[0013 — the pin is a commit of Orkeon's main, never a release](adr/0013-pin-on-orkeon-commit.md),
[0014 — Orkeon main after #244, effort levels, a parallel index and an index cache](adr/0014-orkeon-after-244.md),
[0015 — Orkeon main after #276, the context apart from the request](adr/0015-orkeon-after-276.md),
[0016 — Orkeon main after #280, the edge list, bounded analysis results and a persisted memory](adr/0016-orkeon-after-280.md),
[0017 — Orkeon main after #290, a styled split-pane console](adr/0017-orkeon-after-290.md),
[0018 — Orkeon main after #291, the main loop on the main screen](adr/0018-orkeon-after-291.md),
[0019 — Orkeon main after #293, the `firefox` tool](adr/0019-orkeon-after-293.md),
[0020 — Orkeon main after #295, the rc shims removed](adr/0020-orkeon-after-295.md),
[0021 — Orkeon main after #298, the `firefox` browser that outlives the run](adr/0021-orkeon-after-298.md),
[0022 — one canonical spelling for the host's paths, and the path lists](adr/0022-host-path-spellings.md),
[0023 — Orkeon main after #306, `onToolCall` before the gate and the FWK lots](adr/0023-orkeon-after-306.md),
[0024 — what Orkeon #299 adds, adopted or set aside](adr/0024-orkeon-after-299.md),
[0025 — Orkeon main after #317, `orkeon run --validate` on every crew](adr/0025-orkeon-after-317.md),
[0026 — text apart from logic, by kind and by layer](adr/0026-text-isolation.md).
