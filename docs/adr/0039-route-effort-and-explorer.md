# ADR 0039: the routing picks the thinking level too, and reaches the explorer

- **Status**: accepted
- **Date**: 2026-11-26
- **Builds on**: [ADR 0027](0027-decision-model-optimisations.md), [ADR 0031](0031-orkeon-after-361.md),
  [ADR 0034](0034-orkeon-after-470.md), [ADR 0038](0038-agents-profile.md)

## Context

With `route.agents` on, the host's decision model picks the profile a crew is launched on and the profile of a
reviewer's or the auditor's act, on a ladder of the host's profiles. Three things stayed fixed:

- **The thinking level.** `/effort` stores one level, forwarded as it is to every dev step and sub-agent. [ADR
  0034](0034-orkeon-after-470.md) left the runtime's pick of a level aside: `/effort` sends a fixed level.
- **The explorer.** The agent a turn spawns with `spawn_agent` runs on `agents.profile`, else on the turn's profile,
  whatever its brief asks.
- **The ladder of the examples.** Two rungs, `small,large`, where a provider such as Anthropic offers four models.

The runtime's pick already answers a profile and a level in one decision call (`ctx.llm.pick(request, { profile,
effort })`, `ctx.services.get("pick")` for a command; Orkeon #460, #463): nothing is asked of Orkeon.

## Decision

- **A setting, `route.effort`.** `on` adds the `effort` part to the pick `route.agents` already makes: one decision
  call for both. Off by default, and it asks nothing unless `route.agents` is on: the level is picked with a profile,
  never alone. A session whose profile is outside the ladder, or whose own rung is the one rung left, is asked
  nothing, so its level stands too.
- **`/effort` is the ceiling.** The pick is given `max`, the level `/effort` stored, as it is given the session's
  profile for a ceiling. A session that stored none leaves the pick every level of the host
  (`Orkeon:Decision:Effort:Levels`; `low`, `medium`, `high` when the host lists none). No floor, and no fallback:
  the runtime answers `null` for a level it did not decide.
- **Only a decision moves the level.** The model's pick at 0.6 or more, or the one level the bounds leave
  (`single-level`), replaces the level in place. Under the bar or without an answer the level in place stands: the
  one `/effort` stored for a launch, the crew's own for an act. The line says `effort left as it was`, with the cause.
- **Who is asked a level.** A launch whose crew forwards `/effort` (`/dev-spec`, `/dev-change`, `/dev-plan`): the
  command says so on its task (`thinks`). The other routed launches forward no level today, so asking one would
  print a choice nothing applies. Every routed act of a sub-agent is asked one: an act takes `effort` as it takes
  `profile`.
- **The route answers both.** `routeAgent` and an `ActRoute` answer `{ profile, effort }`. A launch carries the
  level as the `effort` of the crew input, over the stored one; an act as `act({ effort })`. A profile the host
  does not declare is dropped from an act's route, its level kept.
- **The explorer's act is routed.** Its body asks the same `ActRoute` as a reviewer, under the name `explorer`, on
  the brief `spawn_agent` handed it. The ceiling and the crew's profile are those the explorer is built on:
  `agents.profile`, else the turn's. The floors of `.orkeon/route-rules.json` apply to it under `crews.explorer`
  and under the paths its brief names.
- **The record keeps the level.** A choice kept for `/route why` holds the level's answer (`effort`: level, reason,
  pick, probability); one that does not read is dropped from its record, the record kept. A bare `/route` says
  whether `route.effort` is on.
- **A ladder of four rungs is configuration.** The Anthropic example declares `haiku`, `sonnet`, `opus` and `fable`
  under `Llm:Profiles`; `route.ladder haiku,sonnet,opus,fable` orders them. The code takes a ladder of any length,
  and the default stays `small,large`, the profiles of the decision-model examples. [ADR 0040](0040-route-reach.md)
  narrowed the recommended ladder to three rungs, `haiku,sonnet,opus`.

## Consequences

- One decision call per routed launch or act, as before: the level rides in it.
- A refusal of the `effort` part (a host whose levels all lie above the stored one) refuses the whole pick: nothing
  is routed, the session's profile and level stand, and the warning carries the runtime's message.
  [ADR 0042](0042-route-review.md) asks the profile again alone after such a refusal, so that case costs two calls.
- Each `spawn_agent` of a turn now places a decision call when `route.agents` is on, eight at most per turn. A crew
  on `decision.mode: none`, or a host without a decision model, gets the warning the other routed acts get.
- A provider or a model that takes fewer levels than the host offers still receives the highest it knows below the
  one picked, with the runtime's warning ([ADR 0031](0031-orkeon-after-361.md)).
- Not done: a level picked alone, without a profile; a floor for the level; a level for the launches that forward
  none (`/review`, `/analyze`, `/commit`, `/init`, `/init-verifiers`, `/dev-learn`); `/route effort on|off` as a
  shorthand of `/config set route.effort`.
