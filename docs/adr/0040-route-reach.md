# ADR 0040: a ladder of three rungs, a routing that says when it cannot ask, and the subscription ladder

- **Status**: accepted
- **Date**: 2026-11-27
- **Builds on**: [ADR 0034](0034-orkeon-after-470.md), [ADR 0038](0038-agents-profile.md),
  [ADR 0039](0039-route-effort-and-explorer.md)

## Context

[ADR 0039](0039-route-effort-and-explorer.md) gave the routing the thinking level, the explorer and an example of
four profiles, measured by nothing. The first live session then routed nothing, for two causes neither the log on
screen nor `/route` named: the settings file named a decision server that was not running, and `agents.profile` held
a profile outside the ladder. `/route` read `decision model: present` throughout, because the port only says whether
a model is configured. And a session whose agents run on a Claude subscription has one profile, `subscription`, so
no ladder to route on.

## Decision

- **The ladder is measured, and the docs keep it to three rungs.** Eighteen requests, on two, three and four rungs,
  twice ([the decision models](../decision-models.md#measured-ladders-of-two-three-and-four-rungs)): 18, 16 and 13
  decided. On four rungs no request is decided on a middle rung and every hard one goes to the top: a fourth rung
  buys the dearest model for the hard work and loses the requests of the middle. The Anthropic example keeps its
  four profiles, and its comment and the docs name `haiku,sonnet,opus`. The code still takes a ladder of any length,
  and the default stays `small,large`.
- **A bare `/route` asks one test question.** With the routing on and a decision model configured, it sends the
  model a yes/no question about a fixed text (`DecisionModel.ask`, the port the skill suggestions use) and reads
  only whether an answer came back. None, or a throw, reads `configured, but it gave no answer to a test question
  just now`. With the routing off nothing is asked. `/route on` and `/route why` ask nothing either: one decision
  call per status, never per launch. [ADR 0042](0042-route-review.md) replaces this test question by a test pick on
  the ladder.
- **No new port.** `available()` keeps its meaning, a model the settings configure; the test goes through `ask`,
  which already answers null for a failed call.
- **A bare `/route` names a launch profile outside the ladder** (`agents.profile`, else `llm.profile`), the other
  silent cause.
- **The subscription gets its rungs as configuration.** The `agent-cli` example declares `subscription-haiku` and
  `subscription-sonnet`, the profile `subscription` on the two cheaper models, with the same fallback. The ladder
  `subscription-haiku,subscription-sonnet,subscription` then routes under `agents.profile subscription`, its top
  rung. Measured on the same requests: 15 of 18 decided, a similar split to `haiku,sonnet,opus`.
  [ADR 0042](0042-route-review.md) gives each rung the fallback of its own model, on the key.

## Consequences

- A bare `/route` costs one decision call when the routing is on.
- The test tells an answer from no answer, not why none came: a server down, a key refused and a timeout read the
  same.
- The thinking level does not reach the `agent-cli` provider: on the subscription `route.effort` picks a level
  nothing applies, and the docs say to leave it off. [ADR 0041](0041-orkeon-after-488.md) supersedes this line: at
  the pin the level reaches the CLI as `--effort`.
- The measure is of picks, not of runs: it says where a request would run, not what the cheaper model makes of it.
  `medium` was not decided as a level on the eighteen requests; a later pass on twelve briefs worded as the main
  loop words them decided it three times, and `sonnet` five times
  ([the measure](../decision-models.md#measured-ladders-of-two-three-and-four-rungs)).
- Not done: a pick of the level alone, a level for the launches that forward none, a test question at `/route on`.
