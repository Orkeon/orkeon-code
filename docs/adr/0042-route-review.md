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
holds them, and those of a later review of the whole pull request.

## Decision

- **A pick whose level part is refused is asked again for the profile alone.** With `route.effort` on, the runtime
  refuses the whole pick when the host lists no level (`Orkeon:Decision:Effort:Levels`) at or below the one
  `/effort` stored (`/effort low` on `medium,high`), and the routing was lost for a setting of the level. The adapter
  now reads which part of the options the runtime's message names (`part` on the refusal, `profile` or `effort`). A
  refused level part is one warning (`routeLevelRefused`), the profile asked once more without a level
  (`pickProfile`), and the level left in place. Any other refusal (a rung the host does not declare, a floor, a
  fallback), or one whose message names no part, is one warning (`routeRefused`) and no second call: asking again
  without the level would be refused the same way.
- **A route of acts remembers.** The acts of one route (`actRoute`) share one `RouteRun`: a ladder that is no ladder
  and a refused level are each warned of once, at its first act, and after a refused level its next acts ask the
  profile alone, rather than paying a refusal each. Acts started in parallel before the refusal came back still ask
  the level. A route lasts one crew body for the crews wired by `orkeonActRoute`, one batch audit and one reviewer
  in `/dev-batches`, one explorer the main loop spawns. The launch (`routeAgent`) has its own, so a routed crew
  warns at its launch and again at its first act.
- **A stored `route.ladder` that is no ladder is said.** A hand-edited file (one name, a name twice, a malformed
  name) was read as the default ladder in silence, so a session routed on rungs it never named. With the routing on
  and a decision model present, each launch now warns (`routeLadderMisread`), routed or not, since the warning comes
  before the checks of a profile off the ladder and of one rung left, and a bare `/route` shows a warning line (`routeLadderInvalid`), with the routing
  on or off. A value that is not a string (an array, a number) is not such a case: the settings keep non-blank
  strings only (`layerConfig`), so it reads as unset, with no warning, as for every key.
- **A bare `/route` makes a test pick, not a test question.** The yes/no question of [ADR 0040](0040-route-reach.md)
  went through `DecisionModel.ask`, a path the routing does not take: a pick the runtime refuses (a rung the host
  does not declare), a host without the pick and a decision circuit off for the run all read `present`. With the
  routing on, the status now makes one pick through the runtime's pick (`ROUTE_PROBE_REQUEST`), with the bounds a
  launch of the session sends: the ladder, and the launch profile (`agents.profile`, else `llm.profile`) as the
  ceiling and the fallback; no rule's floor, which depends on the command. When a launch would ask nothing, a launch
  profile off the ladder or on the lowest rung, it makes no call and says so. With `route.effort` on it asks the
  level a launch would ask (`routeEffortBounds`); a refused level part makes it pick the profile alone through
  `pickProfile`, show the profile's state, and add the line `routeLevelRefusedLine` under the status, before the
  lines of a ladder that is no ladder and of a launch profile outside the ladder. It shows one of eight states after
  `decision model:`: present, absent, no answer, refused (with the runtime's message), nothing back (a host without
  the pick, a cancelled call, a reply that does not read), not asked (the circuit off), and not tried (off the
  ladder; on the lowest rung). This replaces the test question of ADR 0040.
- **The subscription rungs fall back at their own model.** `subscription-haiku` and `subscription-sonnet` fell back
  on `default`, the dearest model, so a launch routed to a cheap rung cost the most on the key when the subscription
  could not answer. The `agent-cli` example now declares the key profiles `haiku` and `sonnet` and each rung falls
  back on the one of its model; `subscription` still falls back on `default`.
- **`no-ladder` stays handled.** The runtime answers it only for an empty ladder, and the bounds sent always hold two
  rungs or more, so it cannot come back today. It is one of the runtime's typed reasons all the same: dropped, a
  change on either side would make it silent. It keeps its warning (the comment in `route-agent.ts`).

## Consequences

- A bare `/route` makes no decision call with the routing off, without a decision model, and under a launch profile
  off the ladder or on its lowest rung; otherwise one, and two when the runtime refuses the level part.
- A launch whose level part is refused costs a second pick; a second refusal is the usual warning, and nothing is
  routed. On a route of acts, the first act pays it, and the acts after it ask the profile alone.
- The comparison of the profile the pick answers with the session's and the crew's now ignores case
  (`sameProfile`), as the host reads a profile's name.
- Tested: the part read from the runtime's message (`profile-picker.ts`); the second pick of `routeAgent` on a
  refused level part, its warnings, and a single call for a refused ladder, a refusal naming no part and a level
  part refused with no level asked; the misread ladder at a launch, with nothing asked, and under `/route`; the
  acts of one run (each warning once, the profile alone after a refused level, a new launch warning again); the
  states of the test pick, its bounds under `agents.profile` and `llm.profile`, the two cases tried not at all, its
  level under `/effort` and its second pick with the level line; `sameProfile`; the act profiles of a crew and of
  the explorer (`llm-profile.ts`); the fallbacks of the example.
- Not tested: acts started in parallel before a refusal came back; the wiring of the pick into `/route` and of the
  act routes in `src/shared/infrastructure/orkeon/wiring.ts`, exercised by the smokes only.
- The release `v1.4.0` ships the pick with its effort part and the pruning (`SystemOnePicker.cs`, `PickService.cs`,
  `prune` in its typings), unchanged up to the pin: the routing and the pruning run in the tool and docker modes too.
- Checked live at `9ca8530`, with the real `/route` in a scratch project and Jev as the decision model: the ladder
  `haiku,sonnet,opus` with `route.effort` on shows `present`; a ladder naming a rung the host does not declare shows
  the runtime's refusal and its list of profiles; `route.ladder` set to one name shows the warning and `small,large`;
  with the host's levels set to `medium,high` and `/effort low` stored, the state is `present` and the line of the
  refused level follows. Not run live: a launch that meets the refused level (the second pick is covered by the
  tests only).
- Checked live, second pass, same setup: a session on `llm.profile haiku` and one on `agents.profile subscription`
  each show their `not tried` state and make no call; `agents.profile sonnet` with `route.effort` on shows `present`;
  `route.ladder` written as a JSON array shows `small,large` and no warning. Not run live: two acts of one crew
  meeting a refused level.
