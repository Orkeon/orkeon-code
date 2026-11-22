# ADR 0034: Orkeon main after #470, the runtime's prune and pick, the agent-cli provider

- **Status**: accepted
- **Date**: 2026-11-22
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0027](0027-decision-model-optimisations.md),
  [ADR 0032](0032-pruning-in-the-dev-acts.md), [ADR 0033](0033-orkeon-after-447.md)

## Context

The pin moves from `5dc2ff3` to Orkeon `main` `b42e013`, four merges later:

- **#457**, provider modules: `Llm:Provider` names a provider shipped outside the core.
- **#462**, issues #448 to #468. It answers the two requests [ADR 0033](0033-orkeon-after-447.md) left open, and
  more:
  - `ctx.llm.act({ prune })` (#461, `ORKEXP009`): the runtime prunes an act's own tool loop on the host's numbers
    (`Orkeon:Compaction:Prune`, by default 0.4 of the call's usable window, the last 6 messages spared, a cut of 300
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
- **#474**, issues #472, #473 and #475: every verb of the tool (`runs`, `rag`, `eval --crew`, `mcp serve --crew`,
  `email`, `drive`, `forge`) registers the `agent-cli` module, so it takes the settings `orkeon run` takes, and
  `forge` answers a settings refusal with `FORGE-SETTINGS-REFUSED` (exit 1) rather than a crash. No typing changes,
  and this project runs none of these verbs.

## Decision

- **The pruning is the runtime's.** With `compaction.prune` on and a decision model on the host, an act carries
  `prune: true` and nothing else. This project's judge (the `onContextPressure` callback, its questions, its
  re-judge every 8 turns, its state of verdicts) is removed. The numbers are the host's, whose defaults are the
  judge's own. The threshold is a share of the call's usable window, the window less the output reserve, where the
  judge took the session's window: it is lower. The setting, the binding per act and the log line, read from
  `result.pruned`, stay. So does the warning when the host has no decision model for a script: no provider named,
  a provider without its key, a circuit off.
- **The routing is the runtime's pick.** A crew's launch (`/route`, a command) asks `ctx.services.get("pick")`, a
  sub-agent's act (`actRoute`, in a crew) asks `ctx.llm.pick`: one algorithm for both, behind one port,
  `ProfilePicker`. This project keeps what is its own: the setting `route.agents`, `route.ladder`, the floors of
  `.orkeon/route-rules.json`, the session's profile as the ceiling and the fallback, the log line and `/route why`.
  Its questions to `system_one_decide` and its own threshold are removed.
- **What the pick does not decide is said, not recorded.** `circuit-off` and `no-ladder` leave the session's
  profile, with a warning that names the cause. A pick the runtime refuses, a ladder it refuses among them, leaves
  it too, and the runtime's message is logged as a warning. None of these is kept for `/route why`. A host without
  the pick leaves the session's profile without a word, and a session on a profile outside the ladder keeps it with
  one log line.
- **One rung left asks nothing.** A session whose own rung is the one rung left (the lowest, or a rule's floor at
  it or above) is not sent to the pick: no call, no line, no record. On the host's default model, the answer the
  runtime gives without a model call, a rule leaving the top rung alone, is recorded as asked of no model.
- **A choice that decides nothing says what stood.** Under the bar or without an answer, the line and the record
  name the session's profile, a rule's floor, the host's default model or, for an act, its crew's profile.
- **A floor holds for an act on the host's default model.** There an act of a sub-agent takes a rule's floor also
  when the pick is unsure or missing, as a launch does. Under a session's profile such an act stays where its crew
  runs.
- **The request is sent whole.** One line names the crew, then the command as typed: the runtime frames it and
  cuts it to its decision model's size. `route.ladder` refuses a rung named twice, whatever its case.
- **The bounds follow the pick's contract.**
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

- `/route why` shows the runtime's reason and the probability of its pick, for the choices the pick made, and what stood when it
  decided nothing. A record kept before this change is read when its reason is one a choice carries, dropped
  otherwise.
- The tool and docker modes run `1.3.0`, ten commits behind the pin: `act` knows no `prune` there and the host
  serves no `pick`. A run there prunes nothing and routes nothing, and no warning says so.
- A pruning measured before this ADR ([decision models](../decision-models.md)) was this project's judge, against the
  session's window.
