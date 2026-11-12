# ADR 0029: Orkeon main after #333, a sub-agent's act routed to a profile

- **Status**: accepted
- **Date**: 2026-11-12
- **Amends**: [ADR 0027](0027-decision-model-optimisations.md)

## Context

ADR 0027 routes a crew to a profile at its launch and left the acts of its sub-agents where the crew runs: the
runtime's `act` took a model of the agent's provider, not a profile. This project asked for a profile per call
(Orkeon #331).

Orkeon #333 (`8edfa46`), merged on `main` on 2026-11-11, closes it. The options of an LLM call (`LlmCallOptions`, `ActOptions`) take
`llm: { profile?, model? }`: `profile` runs the call on the host profile of that name, by the rule of
`llm.profile(name)`, so a name the host does not declare throws; `model` then chooses the model within that profile.
Orkeon `main` then prepared 1.0.0 (#341, `8ce371d`) and realigned its README (#347, `41f5079`), the commit tagged
`v1.0.0` on 2026-11-12; before it
came its 1.0.0-rc.7 (#332), CI fixes (#334), the stop of the Windows service after a refused configuration (#337)
and account statuses that keep their problems as a list (#340). The pin follows `main` (ADR 0013), whose head is
that release.

## Decision

- **The pin moves to `41f5079`** (the full hash in `.orkeon-version`), the newest merge commit of Orkeon `main`,
  which holds #333 and is the 1.0.0 release; the status meta, the issue template, the guides. The typings from
  `scripts/sync-typings.sh` gain the per-call `llm` patch at `8edfa46`; from there to `41f5079` one comment changes.
- **`ModelOverride` gains `profile`**: the `Llm` port's `act` and `complete` pass it as the runtime's `llm` patch,
  beside `model`. An empty or absent profile sends nothing, as before.
- **`runSubAgent` takes a route**, asked once before the act with the charter's name and the brief. Its answer is
  the profile of that act; none, or a route that throws, leaves the request as it was. The extractions that follow
  the act are not routed: they only parse its reply.
- **The route is the launch's decision** (`actRoute` over the same ports as `routeAgent`): the same setting, ladder,
  floors and 0.6 bar, the session's profile as the ceiling. The session's profile is read from the crew input:
  `llmProfileFallback` when the launch was routed, else `llmProfile`.
- **An act moves only on a decision.** At a launch, no answer or an unsure pick mean the session's profile; inside
  a crew already routed lower that would send every doubtful act back to the dearest model, so there they mean the
  crew's profile. A pick that is the crew's profile moves nothing either.
- **A rung the host does not declare moves nothing** (`declaredRoute`, in the adapter): the name is tried against
  `llm.profile` first, as a routed launch falls back when its rung is missing.
- **Routed**: the reviewer of `/dev-spec`, `/dev-change` and `/dev-plan`, the reviewer of the next batch of
  `/dev-batches`, the auditor of `/dev-verify` (its two rounds, each asked), also when `/dev-batches` runs it in a
  batch agent.
- **Not routed**: the main loop and what ADR 0027 already leaves out; the roles of `/dev-implement`, left for a
  later change; the agents a crew starts in the background; `/advisor`.

- **The guides name the release**: for the first time since ADR 0013 the tool mode runs the pin, from the apt
  `stable` channel, the release archives and the `orkeon.scripting.cli` tool, which `.config/dotnet-tools.json` now
  names at `1.0.0`. The docker mode stays behind: the last image published is `1.0.0-rc.7`, cut before #333.

## Consequences

- An act can run on a dearer model than its crew: a crew launched on `small` has its review on `large` when the
  model picks it, never above the session's profile.
- A crew that makes a routed act asks the decision model once more per act; `/dev-verify` asks twice when the
  auditor names validations.
- `/route why` keeps five choices, launches and acts together, an act under its sub-agent's name
  (`dev-reviewer`, `dev-auditor`): a crew with a routed act pushes older launches out sooner.
- The decision model is asked the launch's question, worded for a command typed by a person, about a brief written
  by a crew. How well it picks there is not measured; nor is the effect on cost.
- On the `1.0.0-rc.7` image the per-call profile does not exist: what a routed act does there was not tried.
- Checks at `41f5079`: `npm run check` green. The routed act was not run against a live host: the tests cover the
  port, the adapter's `llm` patch and each caller over fakes.
