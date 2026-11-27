# ADR 0042: the routing after an adversarial review

- **Status**: accepted
- **Date**: 2026-11-27
- **Builds on**: [ADR 0039](0039-route-effort-and-explorer.md), [ADR 0040](0040-route-reach.md),
  [ADR 0041](0041-orkeon-after-488.md)

## Context

After the pin of [ADR 0041](0041-orkeon-after-488.md), an adversarial review of the routing ran with five
reviewers: the core (`shared/domain/agents/model-route.ts`, `shared/application/agents/route-agent.ts`), the
commands (`/route`, the launches of `commands/_lib/dispatch.ts`), the tests, the English docs against the code, and
the French twins with the pin. It found nothing blocking. Some of its open findings needed a decision; this record
holds them.

## Decision

- **A pick whose level part is refused is asked again for the profile alone.** With `route.effort` on, a level
  `/effort` stored that is not one of the decision model's levels (`Orkeon:Decision:Effort:Levels`) makes the
  runtime refuse the whole pick, and the routing was lost for a setting of the level. The adapter now reads which
  part of the options the runtime's message names (`part` on the refusal, `profile` or `effort`). A refused level
  part is one warning (`routeLevelRefused`), the profile asked once more without a level (`pickProfile`), and the
  level left in place. Any other refusal (a rung the host does not declare, a floor, a fallback) is one warning
  (`routeRefused`) and no second call: asking again without the level would be refused the same way.
- **A stored `route.ladder` that is no ladder is said.** A hand-edited file (one name, a name twice, a malformed
  name) was read as the default ladder in silence, so a session routed on rungs it never named. Each routed launch
  now warns (`routeLadderMisread`), and a bare `/route` shows a warning line (`routeLadderInvalid`), with the routing
  on or off.
- **A bare `/route` makes a test pick, not a test question.** The yes/no question of [ADR 0040](0040-route-reach.md)
  went through `DecisionModel.ask`, a path the routing does not take: a pick the runtime refuses (a rung the host
  does not declare), a host without the pick and a decision circuit off for the run all read `present`. With the
  routing on, the status now makes one pick on the session's ladder through the runtime's pick
  (`ROUTE_PROBE_REQUEST`), and shows one of six states after `decision model:`. With `route.effort` on it asks the
  level a launch would ask (`routeEffortBounds`, the same bounds); a refused level part makes it pick the profile
  alone through `pickProfile`, show the profile's state, and add the line `routeLevelRefusedLine` under the status,
  before the lines of a ladder that is no ladder and of a launch profile outside the ladder. The state for a pick
  that gives nothing back covers a host without the pick, a cancelled call and a reply that does not read. This
  replaces the test question of ADR 0040.
- **The subscription rungs fall back at their own model.** `subscription-haiku` and `subscription-sonnet` fell back
  on `default`, the dearest model, so a launch routed to a cheap rung cost the most on the key when the subscription
  could not answer. The `agent-cli` example now declares the key profiles `haiku` and `sonnet` and each rung falls
  back on the one of its model; `subscription` still falls back on `default`.
- **`no-ladder` stays handled.** The runtime answers it only for an empty ladder, and the bounds sent always hold two
  rungs or more, so it cannot come back today. It is one of the runtime's typed reasons all the same: dropped, a
  change on either side would make it silent. It keeps its warning (the comment in `route-agent.ts`).

## Consequences

- One decision call per bare `/route` with the routing on, two when the level part is refused; none when it is off.
- A launch or an act whose level part is refused costs a second pick; a second refusal is the usual warning, and
  nothing is routed. A refusal whose message names no part gets no second pick either.
- The comparison of the profile the pick answers with the session's and the crew's now ignores case
  (`sameProfile`), as the host reads a profile's name.
- Tested: the part read from the runtime's message (`profile-picker.ts`); the second pick of `routeAgent` on a
  refused level part, its warnings, and the single call on a refused ladder; the misread ladder at a launch and
  under `/route`; the six states of the test pick, its level under `/effort` and its second pick with the level
  line; `sameProfile`; the fallbacks of the example. Not tested: the second pick and the misread warning on the
  route of an act (`actRoute`) and of the explorer, which share the code of a launch; the wiring of the pick into
  `/route` and the act profiles in `src/shared/infrastructure/orkeon/wiring.ts`, exercised by the smokes only.
- Checked live at `9ca8530`, with the real `/route` in a scratch project and Jev as the decision model: the ladder
  `haiku,sonnet,opus` with `route.effort` on shows `present`; a ladder naming a rung the host does not declare shows
  the runtime's refusal and its list of profiles; `route.ladder` set to one name shows the warning and `small,large`;
  with the host's levels set to `medium,high` and `/effort low` stored, the state is `present` and the line of the
  refused level follows. Not run live: a launch that meets the refused level (the second pick is covered by the
  tests only).
