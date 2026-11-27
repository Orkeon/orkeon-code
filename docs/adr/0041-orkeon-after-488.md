# ADR 0041: Orkeon main after #488, the thinking level reaches the subscription

- **Status**: accepted
- **Date**: 2026-11-27
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0037](0037-orkeon-after-486.md),
  [ADR 0039](0039-route-effort-and-explorer.md), [ADR 0040](0040-route-reach.md)

## Context

The pin moves from `948d1b6` to Orkeon `main` `9ca8530`, one merge later:

- **#488** fixes Orkeon #487, opened from this project. The `agent-cli` provider dropped a thinking level with a
  warning, on the ground that the `claude` CLI had no flag for it; the CLI has `--effort`. A call that carries
  a level (`low`, `medium`, `high`, `xhigh`, `max`) now starts the CLI with `--effort <level>`. The level holds for
  a CLI process, so it is part of what makes two calls share one: a call at another level gets a process of its
  own. Thinking switched off, switched on with no level, or bounded by a budget still has no flag and keeps the
  warning. The provider declares its five levels in the capability table.

Before it, [ADR 0040](0040-route-reach.md) recorded that on a subscription ladder `route.effort` picked a level
nothing applied, and the docs said to leave it off there.

The typings do not change. The last release is still `1.4.0`, seven commits behind the pin.

## Decision

- **The advice is reversed.** `docs/configuration.md` and the comment of
  `config/appsettings.agent-cli.example.json` say that a thinking level reaches the CLI, from `/effort` as from the
  pick of `route.effort`, and what it costs: a launch at another level starts a CLI process of its own, within
  `Llm:AgentCli:MaxProcesses`. This replaces the line of ADR 0040 on the level.
- **No source of this project changes** but the pin. Nothing in `src/` treated the level by provider: the routing
  hands the level to the act, and the runtime now sends it.

## Consequences

- Checked live at `9ca8530`, on a profile of the `agent-cli` provider (`claude` 2.1.332): three calls of
  `ctx.llm.complete` with `{ llm: { profile }, effort }`, the shape a routed act uses, started the CLI with
  `--effort low`, `--effort high`, and no `--effort` for a call with no level. No "was not sent" warning.
- Not run: a whole crew routed on the subscription ladder with `route.effort` on, and what a session at several
  levels costs in CLI processes against `MaxProcesses` (4 in the example).
- The check, the REPL smoke, the crew smoke under `--llm-mock` and the validate smoke pass in source mode at
  `9ca8530`.
- The tool and docker modes still run `1.4.0`, where the level is still dropped on this provider.
