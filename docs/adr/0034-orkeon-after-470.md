# ADR 0034: Orkeon main after #470, the runtime's prune and pick, the agent-cli provider

- **Status**: accepted
- **Date**: 2026-11-22
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0027](0027-decision-model-optimisations.md),
  [ADR 0032](0032-pruning-in-the-dev-acts.md), [ADR 0033](0033-orkeon-after-447.md)

## Context

The pin moves from `5dc2ff3` to Orkeon `main` `e7b9bdf`, three merges later:

- **#457**, provider modules: `Llm:Provider` names a provider shipped outside the core.
- **#462**, issues #448 to #468. It answers the two requests [ADR 0033](0033-orkeon-after-447.md) left open, and
  more:
  - `ctx.llm.act({ prune })` (#461, `ORKEXP009`): the runtime prunes an act's own tool loop on the host's numbers
    (`Orkeon:Compaction:Prune`: 0.4 of the call's usable window, the last 6 messages spared, a cut keeps 300
    characters), the host's decision model judging each older result of a read tool, and hands back
    `ActResult.pruned`.
  - `ctx.llm.pick` (#460, `ORKEXP008`) for a crew, and `ctx.services.get("pick")` for a command (#463): System One's
    pick of a profile on a ladder, with a floor, a ceiling and a fallback, held to a probability of 0.6, and its
    reasons (`model`, `low-confidence`, `no-answer`, `circuit-off`, `no-ladder`, `floor`, `ceiling`).
  - A hosted decision provider without its key turns the circuit off (`no-key`, #451); `run.decision` says which key
    (#467); the Anthropic dialect refuses the response schemas it cannot honour (#459); `Llm:WorkspaceId` (#468);
    the settings check refuses what the binder used to take in silence, an enumeration written as a number among
    them (#449 to #456, #464, #465).
- **#470**, the experimental `agent-cli` provider (ADR-020 of Orkeon, `ORKEXP010`): Orkeon on a Claude subscription
  through `claude -p`, the first provider module; and #469, a binder refusal never repeats the value.

## Decision

- **The pruning is the runtime's.** With `compaction.prune` on and a decision model on the host, an act carries
  `prune: true` and nothing else. This project's judge (the `onContextPressure` callback, its questions, its
  re-judge every 8 turns, its state of verdicts) is removed. The numbers were the same; the window is now the call's
  usable window rather than the session's. The setting, the warning when no decision model is there, the binding per
  act and the log line, read from `result.pruned`, stay.
- **The routing is the runtime's pick.** A crew's launch (`/route`, a command) asks `ctx.services.get("pick")`, a
  sub-agent's act (`actRoute`, in a crew) asks `ctx.llm.pick`: one algorithm for both, behind one port,
  `ProfilePicker`. This project keeps what is its own: the setting `route.agents`, `route.ladder`, the floors of
  `.orkeon/route-rules.json`, the session's profile as the ceiling and the fallback, the log line and `/route why`.
  Its questions to `system_one_decide` and its own threshold are removed. `circuit-off`, `no-ladder` and a host
  without the pick leave the session's profile, as a missing decision model did.
  The pick holds only a `model` answer between floor and ceiling, never its fallback, and throws on a floor above the
  ceiling. So the floor is capped at the session's rung. For a session on the host's default model, with no
  ceiling, the fallback is the floor's rung when a rule raises one: a missing pick would otherwise fall back on the
  host's `default` and drop the floor. `/effort` sends a fixed level: no
  effort pick to adopt.
- **The `agent-cli` provider is documented, not wired.** It is a host setting (`"Provider": "agent-cli"`,
  `Llm:AgentCli`), so it needs no code here: an example, `config/appsettings.agent-cli.example.json`, with a
  profile `subscription` that falls back on the default profile on a key when the subscription's limit is reached,
  and a section of [the configuration](../configuration.md#claude-on-a-subscription-the-agent-cli-provider). It runs in
  source mode only: the image has no `claude` and no login, and `1.3.0` has no such provider.
- **Nothing else changes in the code.** No source reads `run.decision`, its `cause` or `detail`, the forge's events,
  nor exit 69, and no crew is `required` on the circuit. The example settings pass the host's checks (`--validate` on
  each). `no-key` and `Llm:WorkspaceId` get a sentence in the docs.

## Consequences

- `/route why` shows the runtime's reasons and probability; a record kept before this change is still read.
- On `1.3.0` (the tool and docker modes) `act` knows no `prune` and the host serves no `pick`: a run there prunes
  nothing and routes nothing.
- A pruning measured before this ADR ([decision models](../decision-models.md)) was this project's judge, against the
  session's window.
