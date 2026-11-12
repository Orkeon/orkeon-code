# Decisions

The architecture decision records of Orkeon Code, in English only. An accepted record is not rewritten: a later
decision amends or replaces it in a record of its own.

## Design decisions

How the code is laid out, how the prompts are written, how the dev steps and the decision model are used.

| ADR | Decision |
|---|---|
| [0001](0001-clean-architecture.md) | Ports, adapters and entry points |
| [0003](0003-prompts-from-a-behaviour-specification.md) | Prompts from a behaviour specification |
| [0011](0011-dev-gates-and-surface.md) | the gates of an unattended run, and five dev commands instead of eight |
| [0013](0013-pin-on-orkeon-commit.md) | the pin is a commit of Orkeon's main, never a release |
| [0022](0022-host-path-spellings.md) | One canonical spelling for the host's paths, and the path lists |
| [0026](0026-text-isolation.md) | Text apart from logic, by kind and by layer |
| [0027](0027-decision-model-optimisations.md) | The decision model asked by Orkeon Code: prune, route, suggest |
| [0028](0028-runtime-downloaded-at-first-start.md) | The runtime of the pin, downloaded at the first start |

## Moves of the pin

Orkeon Code runs on one commit of Orkeon's `main`, named by `.orkeon-version`
([ADR 0013](0013-pin-on-orkeon-commit.md)). Each of these records moves that pin and says what the new runtime
changes for Orkeon Code: what is adopted, what is set aside, what is removed.

| ADR | What the move brings |
|---|---|
| [0002](0002-orkeon-rc6.md) | Orkeon 1.0.0-rc.6 only |
| [0004](0004-orkeon-after-180.md) | Orkeon main after #180, on the rc.6 pin |
| [0005](0005-orkeon-after-206.md) | Orkeon main after #206, on the rc.6 pin |
| [0006](0006-orkeon-after-213.md) | Orkeon main after #213, on the rc.6 pin |
| [0007](0007-orkeon-after-217.md) | Orkeon main after #217, on the rc.6 pin |
| [0008](0008-orkeon-after-223.md) | Orkeon main after #223, on the rc.6 pin |
| [0009](0009-orkeon-after-230.md) | Orkeon main after #230, on the rc.6 pin |
| [0010](0010-orkeon-after-234.md) | Orkeon main after #234, on the rc.6 pin, now a release |
| [0012](0012-orkeon-after-239.md) | Orkeon main after #239, the exclusive crew launch |
| [0014](0014-orkeon-after-244.md) | Orkeon main after #244, effort levels, a parallel index and an index cache |
| [0015](0015-orkeon-after-276.md) | Orkeon main after #276, the context apart from the request |
| [0016](0016-orkeon-after-280.md) | Orkeon main after #280, the edge list, bounded analysis results and a persisted memory |
| [0017](0017-orkeon-after-290.md) | Orkeon main after #290, a styled split-pane console |
| [0018](0018-orkeon-after-291.md) | Orkeon main after #291, the main loop on the main screen |
| [0019](0019-orkeon-after-293.md) | Orkeon main after #293, the `firefox` tool |
| [0020](0020-orkeon-after-295.md) | Orkeon main after #295, the rc shims removed |
| [0021](0021-orkeon-after-298.md) | Orkeon main after #298, the `firefox` browser that outlives the run |
| [0023](0023-orkeon-after-306.md) | Orkeon main after #306, `onToolCall` before the gate and the FWK lots |
| [0024](0024-orkeon-after-299.md) | What Orkeon #299 adds, adopted or set aside |
| [0025](0025-orkeon-after-317.md) | Orkeon main after #317, `orkeon run --validate` on every crew |
| [0029](0029-orkeon-after-333.md) | Orkeon main after #333, a sub-agent's act routed to a profile |
